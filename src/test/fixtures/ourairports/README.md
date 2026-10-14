# OurAirports recorded fixture

Small excerpt of the real OurAirports open-data CSV files, recorded on
2026-10-14 from https://github.com/davidmegginson/ourairports-data
(raw.githubusercontent.com mirror of https://ourairports.com/data/).

OurAirports releases its data to the Public Domain with no guarantee of
accuracy or fitness for use. These rows are used only to verify the adapter's
parsing/normalisation against the real schema. They are **not** a substitute
for official AIP data and must not be used operationally.

Rows were re-serialised with minimal quoting by Python's `csv` module; the
parser is tested against both quoted (upstream) and unquoted forms.
