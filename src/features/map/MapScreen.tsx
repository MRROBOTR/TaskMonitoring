/**
 * Primary map screen. MapLibre renders the basemap (style URL) and aviation
 * overlays as GeoJSON sources with vector layers — no per-feature React
 * components, so thousands of features stay cheap.
 */
import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  NativeUserLocation,
  type CameraRef,
  type PressEventWithFeatures,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, type NativeSyntheticEvent } from 'react-native';
import { useApp } from '@/app-state/AppContext';
import { FreshnessBanner } from '@/components/ui';
import type { AirportType } from '@/domain/models/aviation';
import { evaluateFreshness, DEFAULT_THRESHOLDS } from '@/domain/services/freshness';
import { formatLatLon } from '@/domain/services/geo';
import { useAsync } from '@/hooks/useAsync';
import { listRoutes } from '@/infrastructure/database/appRepository';
import {
  airportsInBounds,
  navaidsInBounds,
  runwaysInBounds,
  type Bounds,
} from '@/infrastructure/database/referenceRepository';
import { getSourceState } from '@/infrastructure/database/sourceRepository';
import { styleById } from '@/providers/basemap/styles';
import { OURAIRPORTS_SOURCE_ID } from '@/providers/aviation/ourairports';
import { useNotams } from '@/features/notams/useNotams';
import { colors } from '@/theme';
import { LayerPanel } from './LayerPanel';
import {
  airportFeatures,
  EMPTY_FC,
  navaidFeatures,
  notamFeatures,
  routeFeatures,
  runwayFeatures,
  visibleNavaidTypes,
} from './layers';
import { SelectionCard, type Selection } from './SelectionCard';

const INITIAL = { center: [35.0, 39.0] as [number, number], zoom: 5 };
const LABEL_FONT = ['Noto Sans Regular'];
const BOLD_FONT = ['Noto Sans Bold'];

export function MapScreen() {
  const { db, settings, revision } = useApp();
  const params = useLocalSearchParams<{ lat?: string; lon?: string; zoom?: string }>();
  const camera = useRef<CameraRef>(null);
  const [view, setView] = useState<{ bounds: Bounds; zoom: number; center: [number, number] } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);
  const [mapError, setMapError] = useState(false);
  const style = styleById(settings.basemapStyleId);
  const L = settings.layers;

  // Fly to a requested location (e.g. "show on map" from a detail screen).
  useEffect(() => {
    const lat = Number(params.lat);
    const lon = Number(params.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon) && params.lat && params.lon) {
      camera.current?.flyTo({ center: [lon, lat], zoom: Number(params.zoom) || 9, duration: 800 });
    }
  }, [params.lat, params.lon, params.zoom]);

  const zoom = view?.zoom ?? INITIAL.zoom;
  // Memoise on threshold booleans so continuous zooming does not create new
  // arrays (and new queries) unless the visible set actually changes.
  const showSmall = L.airports && zoom >= 7;
  const showHeli = L.heliports && zoom >= 9;
  const showNav = zoom >= 5;
  const airportTypes = useMemo<AirportType[]>(() => {
    const t: AirportType[] = [];
    if (L.airports) t.push('large_airport', 'medium_airport');
    if (showSmall) t.push('small_airport', 'seaplane_base');
    if (showHeli) t.push('heliport');
    return t;
  }, [L.airports, showSmall, showHeli]);
  const navTypes = useMemo(() => (showNav ? visibleNavaidTypes(L) : []), [L, showNav]);

  // Debounced viewport query against local SQLite — no network per map move.
  const [queryBounds, setQueryBounds] = useState<Bounds | null>(null);
  useEffect(() => {
    if (!view) return;
    const t = setTimeout(() => setQueryBounds(view.bounds), 250);
    return () => clearTimeout(t);
  }, [view]);

  const ref = useAsync(async () => {
    if (!queryBounds) return null;
    const [airports, navaids, runways] = await Promise.all([
      airportsInBounds(db, queryBounds, airportTypes),
      navaidsInBounds(db, queryBounds, navTypes),
      L.runways && zoom >= 10 ? runwaysInBounds(db, queryBounds) : Promise.resolve([]),
    ]);
    return {
      airports: airportFeatures(airports),
      navaids: navaidFeatures(navaids),
      runways: runwayFeatures(runways),
    };
  }, [db, queryBounds, airportTypes, navTypes, L.runways, zoom >= 10, revision]);

  const refState = useAsync(() => getSourceState(db, OURAIRPORTS_SOURCE_ID), [db, revision]);
  const refFreshness = refState.data
    ? evaluateFreshness(
        {
          configured: true,
          origin: 'provider',
          lastSuccessAt: refState.data.lastSuccessAt,
          lastAttemptAt: refState.data.lastAttemptAt,
          lastAttemptFailed: refState.data.lastAttemptFailed,
          hasData: !!refState.data.lastSuccessAt,
        },
        DEFAULT_THRESHOLDS.reference,
      )
    : 'not-configured';

  const notams = useNotams();
  const notamFc = useMemo(
    () =>
      notamFeatures(
        notams.evaluated.map((e) => ({ notam: e.notam, lifecycle: e.life.state })),
        settings.showExpiredNotams,
      ),
    [notams.evaluated, settings.showExpiredNotams],
  );

  const routes = useAsync(() => listRoutes(db), [db, revision]);
  const activeRoute = routes.data?.find((r) => r.id === settings.activeRouteId) ?? null;
  const routeFc = useMemo(() => (activeRoute ? routeFeatures(activeRoute.points) : EMPTY_FC), [activeRoute]);

  const onRegion = useCallback((e: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    const { bounds, zoom: z, center } = e.nativeEvent;
    setView({ bounds: bounds as Bounds, zoom: z, center: center as [number, number] });
  }, []);

  const onFeaturePress = useCallback((e: NativeSyntheticEvent<PressEventWithFeatures>) => {
    // Press events emit on both the Source and the Map; stop it so the Map's
    // "tap empty area clears selection" handler does not run.
    e.stopPropagation();
    const f = e.nativeEvent.features[0];
    const p = f?.properties as Record<string, unknown> | null | undefined;
    if (!p || typeof p.kind !== 'string' || typeof p.id !== 'string') return;
    if (p.kind === 'airport' || p.kind === 'navaid' || p.kind === 'notam') {
      setSelection({ kind: p.kind, id: p.id });
    }
  }, []);

  const locate = useCallback(async () => {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Konum izni verilmedi', 'Konum yalnızca haritada göstermek için kullanılır ve cihazdan çıkmaz.');
      return;
    }
    setLocationGranted(true);
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    camera.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 9, duration: 800 });
  }, []);

  return (
    <View style={styles.container} testID="map-screen">
      <Map
        style={styles.map}
        mapStyle={style.url}
        onRegionDidChange={onRegion}
        onDidFailLoadingMap={() => setMapError(true)}
        onDidFinishLoadingMap={() => setMapError(false)}
        compass
        compassPosition={{ top: 110, right: 12 }}
        scaleBar
        scaleBarPosition={{ bottom: 24, left: 12 }}
        attribution
        attributionPosition={{ bottom: 4, right: 8 }}
        logo
        logoPosition={{ bottom: 4, left: 8 }}
        onPress={() => setSelection(null)}
      >
        <Camera ref={camera} initialViewState={INITIAL} minZoom={2} maxZoom={17} />
        {locationGranted ? <NativeUserLocation /> : null}

        {L.notamAreas ? (
          <GeoJSONSource id="notam-areas" data={notamFc.areas} onPress={onFeaturePress}>
            <Layer
              type="fill"
              id="notam-area-fill"
              style={{
                fillColor: ['match', ['get', 'confidence'], 'confirmed', colors.notamConfirmed, colors.notamApprox],
                fillOpacity: 0.15,
              }}
            />
            <Layer
              type="line"
              id="notam-area-line-confirmed"
              filter={['==', ['get', 'confidence'], 'confirmed']}
              style={{ lineColor: colors.notamConfirmed, lineWidth: 2 }}
            />
            <Layer
              type="line"
              id="notam-area-line-approx"
              filter={['!=', ['get', 'confidence'], 'confirmed']}
              style={{ lineColor: colors.notamApprox, lineWidth: 1.5, lineDasharray: [3, 2] }}
            />
            <Layer
              type="symbol"
              id="notam-area-label"
              minzoom={7}
              style={{
                textField: ['get', 'displayId'],
                textFont: BOLD_FONT,
                textSize: 11,
                textColor: colors.notamConfirmed,
                textHaloColor: '#000',
                textHaloWidth: 1.2,
              }}
            />
          </GeoJSONSource>
        ) : null}

        {L.runways ? (
          <GeoJSONSource id="runways" data={ref.data?.runways ?? EMPTY_FC}>
            <Layer type="line" id="runway-line" style={{ lineColor: '#E8E8E8', lineWidth: ['interpolate', ['linear'], ['zoom'], 10, 2, 14, 8] }} />
          </GeoJSONSource>
        ) : null}

        <GeoJSONSource id="airports" data={ref.data?.airports ?? EMPTY_FC} onPress={onFeaturePress}>
          <Layer
            type="circle"
            id="airport-circle"
            style={{
              circleRadius: ['match', ['get', 'rank'], 3, 7, 2, 5.5, 4],
              circleColor: ['match', ['get', 'apType'], 'heliport', colors.heliport, 'closed', '#555', colors.airport],
              circleStrokeColor: '#FFFFFF',
              circleStrokeWidth: ['match', ['get', 'rank'], 3, 2.5, 1.5],
            }}
          />
          <Layer
            type="symbol"
            id="airport-label"
            minzoom={6}
            style={{
              textField: ['get', 'ident'],
              textFont: BOLD_FONT,
              textSize: 11,
              textOffset: [0, 1.3],
              textColor: '#FFFFFF',
              textHaloColor: '#0B1220',
              textHaloWidth: 1.5,
              textOptional: true,
            }}
          />
        </GeoJSONSource>

        <GeoJSONSource id="navaids" data={ref.data?.navaids ?? EMPTY_FC} onPress={onFeaturePress}>
          {/* Distinct symbology by source classification */}
          <Layer
            type="circle"
            id="navaid-ndb"
            filter={['in', ['get', 'navType'], ['literal', ['NDB', 'NDB-DME']]]}
            style={{ circleRadius: 6, circleColor: 'rgba(0,0,0,0)', circleStrokeColor: colors.ndb, circleStrokeWidth: 3 }}
          />
          <Layer
            type="circle"
            id="navaid-vor"
            filter={['in', ['get', 'navType'], ['literal', ['VOR', 'VOR-DME', 'VORTAC']]]}
            style={{
              circleRadius: 6,
              circleColor: ['match', ['get', 'navType'], 'VOR', 'rgba(0,0,0,0)', colors.vor],
              circleStrokeColor: colors.vor,
              circleStrokeWidth: ['match', ['get', 'navType'], 'VORTAC', 4, 2],
            }}
          />
          <Layer
            type="circle"
            id="navaid-dme"
            filter={['in', ['get', 'navType'], ['literal', ['DME', 'TACAN']]]}
            style={{ circleRadius: 5, circleColor: colors.dme, circleStrokeColor: '#000', circleStrokeWidth: 1 }}
          />
          <Layer
            type="symbol"
            id="navaid-label"
            minzoom={7}
            style={{
              textField: ['concat', ['get', 'navType'], '\n', ['get', 'label']],
              textFont: LABEL_FONT,
              textSize: 10,
              textOffset: [0, 1.6],
              textColor: '#CFFAF5',
              textHaloColor: '#0B1220',
              textHaloWidth: 1.5,
              textOptional: true,
            }}
          />
        </GeoJSONSource>

        {L.notamPoints ? (
          <GeoJSONSource id="notam-points" data={notamFc.points} onPress={onFeaturePress}>
            <Layer type="circle" id="notam-point" style={{ circleRadius: 7, circleColor: colors.notamApprox, circleStrokeColor: '#000', circleStrokeWidth: 2 }} />
          </GeoJSONSource>
        ) : null}

        {L.route ? (
          <GeoJSONSource id="route" data={routeFc}>
            <Layer type="line" id="route-line" filter={['==', ['get', 'kind'], 'route-line']} style={{ lineColor: colors.route, lineWidth: 3 }} />
            <Layer type="circle" id="route-point" filter={['==', ['get', 'kind'], 'route-point']} style={{ circleRadius: 5, circleColor: colors.route, circleStrokeColor: '#fff', circleStrokeWidth: 1.5 }} />
            <Layer
              type="symbol"
              id="route-label"
              filter={['==', ['get', 'kind'], 'route-point']}
              style={{ textField: ['get', 'ident'], textFont: BOLD_FONT, textSize: 12, textOffset: [0, -1.4], textColor: colors.route, textHaloColor: '#000', textHaloWidth: 1.5 }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>

      <View style={styles.topBar} pointerEvents="box-none">
        <FreshnessBanner state={notams.freshness.state} source={`NOTAM · ${notams.freshness.source}`} lastSuccessAt={notams.freshness.lastSuccessAt} detail={notamFc.unmapped > 0 ? `${notamFc.unmapped} NOTAM haritalanamadı (geometri yok) — NOTAM listesinde` : undefined} />
        <FreshnessBanner state={refFreshness} source="OurAirports (Public Domain)" lastSuccessAt={refState.data?.lastSuccessAt ?? null} />
        {mapError ? <Text style={styles.mapError}>Basemap yüklenemedi (çevrimdışı ve bu bölge için çevrimdışı paket yok olabilir). Havacılık katmanları yerel veriden çizilmeye devam eder.</Text> : null}
      </View>

      <View style={styles.controls}>
        <MapButton label="Katman" onPress={() => setPanelOpen((o) => !o)} testID="layers-button" />
        <MapButton label="Konum" onPress={locate} testID="locate-button" />
        <MapButton label="Ara" onPress={() => router.push('/airports')} />
      </View>

      <View style={styles.coords} pointerEvents="none">
        <Text style={styles.coordText} testID="center-coordinate">
          {view ? `${formatLatLon({ lat: view.center[1], lon: view.center[0] })}  Z${view.zoom.toFixed(1)}` : '—'}
        </Text>
      </View>

      {panelOpen ? <LayerPanel onClose={() => setPanelOpen(false)} /> : null}
      {selection ? <SelectionCard selection={selection} onClose={() => setSelection(null)} /> : null}
    </View>
  );
}

function MapButton({ label, onPress, testID }: { label: string; onPress: () => void; testID?: string }) {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.mapButton, pressed && { opacity: 0.7 }]}>
      <Text style={styles.mapButtonText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  map: { flex: 1 },
  topBar: { position: 'absolute', top: 8, left: 8, right: 8, gap: 4 },
  mapError: { backgroundColor: '#3A1010', color: colors.text, padding: 6, borderRadius: 6, fontSize: 12 },
  controls: { position: 'absolute', right: 10, top: 160, gap: 8 },
  mapButton: { backgroundColor: 'rgba(19,28,46,0.92)', borderColor: colors.border, borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 10, minWidth: 64, alignItems: 'center' },
  mapButtonText: { color: colors.text, fontWeight: '700', fontSize: 12 },
  coords: { position: 'absolute', bottom: 48, left: 10, backgroundColor: 'rgba(11,18,32,0.85)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  coordText: { color: colors.text, fontFamily: 'monospace', fontSize: 12 },
});
