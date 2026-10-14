/**
 * All data sources known to the app, including those that are documented but
 * blocked (no authorised access yet). Blocked sources are shown in Data
 * Management so the user can see exactly what is missing and why.
 */
import type { DataSourceDescriptor } from '@/domain/models/provenance';
import { OURAIRPORTS_DESCRIPTOR } from './aviation/ourairports';
import { BACKEND_NOTAM_SOURCE_ID } from './notams/backend';
import { MANUAL_NOTAM_DESCRIPTOR } from './notams/manualImport';
import { OPENFREEMAP_DESCRIPTOR } from './basemap/styles';

export const OPENAIP_DESCRIPTOR: DataSourceDescriptor = {
  id: 'openaip',
  name: 'OpenAIP',
  documentationUrl: 'https://openaip.github.io/openaip-api-documentation/',
  categories: ['airports', 'airspaces', 'navaids', 'reporting-points', 'obstacles'],
  coverage: 'Dünya geneli (topluluk)',
  updateFrequency: 'Sürekli (topluluk düzenlemeleri)',
  access: 'api-key',
  license: 'CC BY-NC 4.0 (ikincil kaynaktan bildirildi; resmi sayfa doğrulanamadı)',
  attribution: 'openAIP (openaip.net)',
  offlineStoragePermitted: null,
  redistributionPermitted: null,
  limitations: [
    'API şeması (api.core.openaip.net/api/system/specs/v1/schema.json) geliştirme ortamından erişilemediği için doğrulanmadı.',
    'Ticari olmayan kullanım lisansı bildirildi; ticari dağıtımda ayrı lisans gerekebilir.',
    'Kullanıcıya ait API anahtarı gerektirir.',
  ],
  verification: 'blocked',
};

export const FAA_NMS_DESCRIPTOR: DataSourceDescriptor = {
  id: 'faa-nms',
  name: 'FAA NOTAM Management Service (NMS-API)',
  documentationUrl: 'https://www.faa.gov/about/initiatives/notam',
  categories: ['notams'],
  coverage: 'FAA dağıtım sisteminin kapsamı (ABD + uluslararası seriler); evrensel değildir',
  updateFrequency: 'Sağlayıcıya göre',
  access: 'backend-required',
  license: 'FAA erişim koşulları (manuel onay ile verilen kimlik bilgileri)',
  attribution: 'FAA NOTAM data',
  offlineStoragePermitted: null,
  redistributionPermitted: null,
  limitations: [
    'Kimlik bilgileri FAA tarafından manuel verilir; self-servis kayıt yok.',
    'İstemci sırları mobil uygulamaya gömülemez — sunucu tarafı gerekir.',
    'Uç nokta ve şema bu ortamda doğrulanamadı (aa.data.faa.gov erişilemedi).',
  ],
  verification: 'blocked',
};

export const DHMI_DESCRIPTOR: DataSourceDescriptor = {
  id: 'dhmi-ais',
  name: 'DHMİ AIS (Türkiye)',
  documentationUrl: 'https://ais.dhmi.gov.tr/',
  categories: ['notams', 'pib', 'aip', 'charts'],
  coverage: 'Türkiye (LTAA / LTBB FIR)',
  updateFrequency: 'Resmi yayın döngüsü',
  access: 'account',
  license: 'DHMİ kullanım koşulları',
  attribution: 'DHMİ AIS',
  offlineStoragePermitted: null,
  redistributionPermitted: null,
  limitations: [
    'Belgelenmiş bir genel API bulunamadı; portal HTML sayfaları API olarak kullanılmaz.',
    'Kimlik doğrulamalı sayfalar kazınmaz. Manuel içe aktarım kullanılır.',
  ],
  verification: 'blocked',
};

export const EAD_DESCRIPTOR: DataSourceDescriptor = {
  id: 'eurocontrol-ead',
  name: 'EUROCONTROL EAD',
  documentationUrl: 'https://www.eurocontrol.int/service/european-ais-database',
  categories: ['notams', 'aip', 'aixm'],
  coverage: 'Avrupa ağırlıklı; dünya geneli kapsam iddia edilmez',
  updateFrequency: 'Resmi yayın döngüsü',
  access: 'agreement',
  license: 'EAD hizmet sözleşmesi',
  attribution: 'EUROCONTROL EAD',
  offlineStoragePermitted: null,
  redistributionPermitted: null,
  limitations: ['Operasyonel veri erişimi hizmet sözleşmesi gerektirir.'],
  verification: 'blocked',
};

export const BACKEND_NOTAM_DESCRIPTOR: DataSourceDescriptor = {
  id: BACKEND_NOTAM_SOURCE_ID,
  name: 'ATLAS senkronizasyon sunucusu (NOTAM)',
  documentationUrl: 'docs/NOTAM_PIPELINE.md',
  categories: ['notams'],
  coverage: 'Sunucunun yetkili sağlayıcılarına bağlı',
  updateFrequency: 'Sunucuya bağlı',
  access: 'backend-required',
  license: 'Alt sağlayıcının koşulları',
  attribution: 'Alt sağlayıcı',
  offlineStoragePermitted: null,
  redistributionPermitted: null,
  limitations: ['Sunucu henüz mevcut değil; sözleşme tanımlı, istemci adaptörü hazır.'],
  verification: 'blocked',
};

export const ALL_SOURCES: DataSourceDescriptor[] = [
  OURAIRPORTS_DESCRIPTOR,
  MANUAL_NOTAM_DESCRIPTOR,
  OPENFREEMAP_DESCRIPTOR,
  OPENAIP_DESCRIPTOR,
  FAA_NMS_DESCRIPTOR,
  DHMI_DESCRIPTOR,
  EAD_DESCRIPTOR,
  BACKEND_NOTAM_DESCRIPTOR,
];
