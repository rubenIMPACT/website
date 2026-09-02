#!/usr/bin/env python3
"""Baut die Import-Datei fuer den Tab "Klassenanalyse" im Sheet "IMPACT Website Leads Log".

Eingabe: das JSON, das scripts/fetch_reports.js im eingeloggten exercise.com-Tab liefert:
  {
    "window": {"start": "2026-08-01", "end": "2026-08-31"},
    "recurring": [ {"ID":..., "Service":..., "Location":..., "Start Time":..., "Days":..., "Total Visits":..., ...}, ... ],
    "popular": { "Zurich": {"reports": [ {"name": "Fitness Kickboxing", "items": [[label, events, booked, attended, capacity], ...]}, ... ]},
                 "Winterthur": {...} }
  }

Logik identisch mit dem Skill impact-class-analysis (build_workbook.py):
  Termine, Besuche, Plaetze aus Popular Services (nur "(Class)"-Zeilen, keine Einzeltermine),
  Unique Users, Buchungen, Trainer aus Recurring Sessions, verbunden ueber Standort + Kurs + Wochentag + Startzeit.

Ausgabe: JSON fuer das Apps-Script (importKlassenanalyse), Zeilen bereits sortiert wie der Stundenplan.

Aufruf:
    python build_import.py reports.json -o klassenanalyse-2026-08.json
"""
import argparse, collections, json, re, sys

DAYORDER = {'Mo': 0, 'Tu': 1, 'We': 2, 'Th': 3, 'Fr': 4, 'Sa': 5, 'Su': 6}
SERIES = re.compile(r'^(Mo|Tu|We|Th|Fr|Sa|Su)(?:, ?(?:Mo|Tu|We|Th|Fr|Sa|Su))* at (\d{2}:\d{2} [AP]M) \((?:CEST|CET)\) from .+ \(Class\)$')
KIDS = re.compile(r'little ninjas|kids|kinder', re.I)
FREE = re.compile(r'open mat', re.I)
# Services, die keine Klassen sind (Anmeldegespraeche, Personal Training, Workshops), werden ignoriert.
SKIP = re.compile(r'anmeldegespr|personal training|workshop|seminar|probetraining|trial', re.I)


def minutes(t):
    h, mi = map(int, t[:5].split(':'))
    return (h % 12 + (12 if t[6:8].upper() == 'PM' else 0)) * 60 + mi


def hm(m):
    return f'{m // 60:02d}:{m % 60:02d}'


def segment(service):
    if KIDS.search(service): return 'Kids'
    if FREE.search(service): return 'Gratis'
    return 'Erwachsene'


def load(data):
    agg = collections.defaultdict(lambda: [0, 0, 0, 0])   # events, attended, capacity, booked
    for loc, rep in (data.get('popular') or {}).items():
        for svc in rep.get('reports', []):
            name = (svc.get('name') or '').strip()
            if not name or SKIP.search(name):
                continue
            for it in svc.get('items', []):
                label = str(it[0])
                m = SERIES.match(label)
                if not m:
                    continue                    # Einzeltermin, kein woechentlicher Kurs
                days = label.split(' at ')[0]
                start = m.group(2)
                try:
                    ev, booked, att, cap = (int(float(x)) for x in it[1:5])
                except (TypeError, ValueError):
                    continue
                a = agg[(loc, name, days, start)]
                a[0] += ev; a[1] += att; a[2] += cap; a[3] += booked
    extra = {}
    for r in data.get('recurring') or []:
        loc = (r.get('Location') or '').strip()
        svc = (r.get('Service') or '').strip()
        if not loc or not svc:
            continue
        start = (r.get('Start Time') or '')[:8]
        days = (r.get('Days') or '').strip()
        k = (loc, svc, days, start)
        e = extra.setdefault(k, {'uniq': 0, 'visits': 0, 'sessions': 0, 'staff': set()})
        e['uniq'] = max(e['uniq'], num(r.get('Total Unique Users')))
        e['visits'] += num(r.get('Total Visits'))
        e['sessions'] += num(r.get('Total Sessions'))
        for st in (r.get('Primary Staff'), r.get('Secondary Staff')):
            if st: e['staff'].add(st.strip())
    rows = []
    for (loc, sv, days, start), (ev, att, cap, booked) in agg.items():
        if ev == 0:
            continue
        e = extra.get((loc, sv, days, start), {})
        rows.append(dict(location=loc, service=sv, days=days, start=hm(minutes(start)), minutes=minutes(start),
                         daytype='Sa' if days == 'Sa' else 'Werktag', segment=segment(sv),
                         events=ev, attended=att, capacity=cap, booked=booked,
                         uniq=int(e.get('uniq', 0)), rec_visits=int(e.get('visits', 0)),
                         staff=', '.join(sorted(e.get('staff', ()))), matched=bool(e)))
    rows.sort(key=lambda r: (r['location'], DAYORDER.get(r['days'].split(',')[0].strip(), 9), r['minutes'], r['service']))
    return rows


def num(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def summary(rows):
    out = {}
    for r in rows:
        if r['segment'] == 'Gratis':
            continue
        s = out.setdefault(r['location'], {'classes': 0, 'events': 0, 'attended': 0, 'capacity': 0})
        s['classes'] += 1; s['events'] += r['events']; s['attended'] += r['attended']; s['capacity'] += r['capacity']
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('-o', '--output', required=True)
    a = ap.parse_args()
    data = json.load(open(a.input, encoding='utf-8'))
    rows = load(data)
    if not rows:
        sys.exit('Keine Klassen erkannt. Popular-Services-Daten pruefen.')
    win = data.get('window') or {}
    out = dict(window=win, generated=data.get('generated', ''), rows=rows, summary=summary(rows),
               unmatched=sum(1 for r in rows if not r['matched']))
    json.dump(out, open(a.output, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(rows)} Klassen -> {a.output}')
    for loc, s in sorted(out['summary'].items()):
        print(f"  {loc}: {s['classes']} Klassen, {s['events']} Termine, {s['attended']} Besuche, {s['capacity']} Plaetze, "
              f"Auslastung {s['attended'] / s['capacity']:.0%}" if s['capacity'] else f'  {loc}: keine Plaetze')
    if out['unmatched']:
        print(f"  {out['unmatched']} Klassen ohne Gegenstueck im Recurring-Report (keine Unique Users/Trainer)")


if __name__ == '__main__':
    main()
