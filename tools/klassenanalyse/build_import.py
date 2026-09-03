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
    python build_import.py reports.json --revenue revenue.json -o klassenanalyse-2026-08.json
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


EXCL_HIT = re.compile(r'open mat|self defense for women', re.I)   # nicht in der Hitlist (Entscheid Ruben 03.09.2026)


def apply_revenue(rows, rv):
    """Value Pricing: verteilter Abo-Nettoumsatz je Slot (aus fetch_reports.js REVENUE) an die Klassenzeilen haengen.
    Schluessel Standort|Kurs|Wochentag|HH:MM; Zeilen mit mehreren Tagen (z.B. 'We, Fr') summieren ueber die Tage."""
    if not rv or not rv.get('slots'):
        return None
    norm = lambda k: '|'.join(' '.join(x.split()) for x in k.split('|'))   # exercise.com liefert z.B. 'Boxing - All Levels ' mit Leerzeichen
    slots = {norm(k): v for k, v in rv['slots'].items()}
    used = set()
    for r in rows:
        chf, vis = 0.0, 0
        for d in r['days'].split(','):
            k = norm(f"{r['location']}|{r['service']}|{d.strip()}|{r['start']}")
            if k in slots:
                chf += slots[k]['chf']; vis += slots[k]['visits']; used.add(k)
        r['revenue'] = round(chf, 2); r['revenue_visits'] = vis
        r['revenue_per_event'] = round(chf / r['events'], 2) if r['events'] else None
    other = collections.defaultdict(float)
    for k, sl in slots.items():
        if k not in used:
            other[k.split('|')[1]] += sl['chf']
    out = {k: v for k, v in rv.items() if k != 'slots'}
    out['class_total'] = round(sum(r['revenue'] for r in rows), 2)
    out['other_services'] = {k: round(v, 2) for k, v in sorted(other.items(), key=lambda x: -x[1])}
    out['other_total'] = round(sum(other.values()), 2)
    return out


def discipline(service):
    """Disziplin ohne Level. BJJ Gi und No-Gi getrennt, Levels zusammen, Competition drin, Kids drin."""
    x = re.sub(r'\s+', ' ', service.replace('&amp;', '&')).strip()
    x = re.sub(r'\s*-\s*(Basics|All Levels|Competition)\s*$', '', x, flags=re.I).strip()
    if re.match(r'^BJJ \(No-Gi\)', x, re.I): return 'BJJ No-Gi'
    if re.match(r'^BJJ \(Gi\)', x, re.I): return 'BJJ Gi'
    if re.match(r'^BJJ$', x, re.I): return 'BJJ Competition'  # "BJJ - Competition": zaehlt in der Hitlist zu Gi UND No-Gi (Entscheid Ruben 03.09.2026)
    if re.match(r'^Striking', x, re.I): return 'Muay Thai'    # "Striking - Competition" = Muay-Thai-Kader
    return x


def level(service):
    m = re.search(r'-\s*(Basics|All Levels|Competition)\s*$', service, re.I)
    return m.group(1) if m else ''


def slot_factors(rows):
    """Slot-Faktor je Klasse: Oe pro Klasse / Oe aller Nicht-Gratis-Klassen zur selben Uhrzeit, Standort, Tagtyp."""
    slot = collections.defaultdict(lambda: [0, 0, set()])   # attended, events, Disziplinen im Slot
    for r in rows:
        if r['segment'] == 'Gratis': continue
        k = (r['location'], r['daytype'], r['minutes'])
        slot[k][0] += r['attended']; slot[k][1] += r['events']; slot[k][2].add(r.get('discipline', r['service']))
    for r in rows:
        k = (r['location'], r['daytype'], r['minutes'])
        if r['segment'] == 'Gratis' or slot[k][1] == 0:
            r['slot_ratio'] = None; r['has_neighbor'] = False
        else:
            avg_slot = slot[k][0] / slot[k][1]
            r['slot_ratio'] = (r['attended'] / r['events']) / avg_slot if avg_slot else None
            # "mit Vergleich" = im Slot laeuft mindestens eine ANDERE Disziplin (gleiche Disziplin am anderen Wochentag ist kein Vergleich)
            r['has_neighbor'] = len(slot[k][2] - {r.get('discipline', r['service'])}) > 0


MIN_AVG, MIN_EV = 3, 4  # Mindestschwelle je Standort fuer einen Hitlist-Index


def hitlist(rows, key, total_rev=0):
    """Gewichtete Hitlist. key(r) = Gruppenname. Index = Slot-Faktor gewichtet mit Terminen, ERST je Standort,
    dann Mittel beider Standorte. Termine mit Vergleich = Termine in Slots mit mindestens einer Nachbarklasse."""
    per = collections.defaultdict(lambda: collections.defaultdict(lambda: dict(w=0, wr=0, ev=0, att=0, cap=0, evn=0, uniq=0, n=0, rev=0.0)))
    for r in rows:
        if r['segment'] == 'Gratis' or EXCL_HIT.search(r['service']): continue
        k = key(r)
        # BJJ Competition (ohne Gi-Angabe) zaehlt zu beiden BJJ-Listen
        keys = [k.replace('BJJ Competition', 'BJJ Gi'), k.replace('BJJ Competition', 'BJJ No-Gi')] if 'BJJ Competition' in k else [k]
        for kk in keys:
            g = per[kk][r['location']]
            g['ev'] += r['events']; g['att'] += r['attended']; g['cap'] += r['capacity']; g['uniq'] += r['uniq']; g['n'] += 1; g['rev'] += r.get('revenue') or 0
            if r.get('slot_ratio') is not None:
                g['w'] += r['events']; g['wr'] += r['events'] * r['slot_ratio']
                if r.get('has_neighbor'): g['evn'] += r['events']
    out = []
    for name, locs in per.items():
        row = dict(name=name); vals = []
        for loc in ('Zurich', 'Winterthur'):
            g = locs.get(loc)
            if g and g['w']:
                avg = g['att'] / g['ev'] if g['ev'] else 0
                # Mindestschwelle (Ruben 03.09.2026): unter MIN_AVG Personen pro Klasse oder MIN_EV Terminen ist der
                # Slot-Index Zufall (z.B. 2.5 Personen in einem toten Slot ergaben Index 1.33) -> kein Index (n/a)
                idx = g['wr'] / g['w'] if (avg >= MIN_AVG and g['ev'] >= MIN_EV) else None
                if idx is not None: vals.append(idx)
                row[loc] = dict(index=idx, util=g['att'] / g['cap'] if g['cap'] else 0, events=g['ev'], attended=g['att'],
                                avg=avg, with_neighbor=g['evn'], uniq=g['uniq'], classes=g['n'], revenue=round(g['rev'], 2))
            else:
                row[loc] = None
        row['index'] = sum(vals) / len(vals) if vals else None
        row['events'] = sum(locs[l]['ev'] for l in locs); row['attended'] = sum(locs[l]['att'] for l in locs)
        row['capacity'] = sum(locs[l]['cap'] for l in locs); row['with_neighbor'] = sum(locs[l]['evn'] for l in locs)
        row['uniq'] = sum(locs[l]['uniq'] for l in locs)
        row['revenue'] = round(sum(locs[l]['rev'] for l in locs), 2) if total_rev else None
        row['revenue_share'] = (row['revenue'] / total_rev) if total_rev else None
        row['util'] = row['attended'] / row['capacity'] if row['capacity'] else 0
        out.append(row)
        row['revenue_per_event'] = round(row['revenue'] / row['events'], 2) if (total_rev and row['events']) else None
    # Rang nach Umsatz (Entscheid Ruben 03.09.2026); ohne Umsatzdaten nach Index
    if total_rev:
        out.sort(key=lambda r: (-(r['revenue'] or 0), -r['attended']))
    else:
        out.sort(key=lambda r: (-(r['index'] if r['index'] is not None else -9), -r['attended']))
    return out


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
        s['revenue'] = round(s.get('revenue', 0) + (r.get('revenue') or 0), 2)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input')
    ap.add_argument('-o', '--output', required=True)
    ap.add_argument('--revenue', help='revenue.json aus __ka.dump(2) (Umsatz + Kuendigungsrisiko); optional, sonst muss "revenue" im Input stecken')
    a = ap.parse_args()
    data = json.load(open(a.input, encoding='utf-8'))
    if a.revenue:
        rv = json.load(open(a.revenue, encoding='utf-8'))
        data['revenue'] = rv.get('revenue', rv)
    rows = load(data)
    if not rows:
        sys.exit('Keine Klassen erkannt. Popular-Services-Daten pruefen.')
    win = data.get('window') or {}
    for r in rows:
        r['discipline'] = discipline(r['service']); r['level'] = level(r['service'])
    slot_factors(rows)
    rev = apply_revenue(rows, data.get('revenue'))
    total_rev = rev['class_total'] if rev else 0
    out = dict(window=win, generated=data.get('generated', ''), rows=rows, summary=summary(rows), revenue=rev,
               unmatched=sum(1 for r in rows if not r['matched']),
               hitlist=hitlist(rows, lambda r: r['discipline'], total_rev),
               hitlist_levels=hitlist(rows, lambda r: r['discipline'] + (' ' + r['level'] if r['level'] else ''), total_rev))
    json.dump(out, open(a.output, 'w', encoding='utf-8'), ensure_ascii=False)
    print(f'{len(rows)} Klassen -> {a.output}')
    for loc, s in sorted(out['summary'].items()):
        print(f"  {loc}: {s['classes']} Klassen, {s['events']} Termine, {s['attended']} Besuche, {s['capacity']} Plaetze, "
              f"Auslastung {s['attended'] / s['capacity']:.0%}" if s['capacity'] else f'  {loc}: keine Plaetze')
    if rev:
        print(f"Value Pricing: {rev['class_total']:.0f} CHF netto auf Klassen verteilt, {rev['other_total']:.0f} CHF auf andere Services (PT etc.), "
              f"{rev['nosub_visits']} Check-ins ohne Abo; ohne Besuch: " + ', '.join(f"{k} {v['novisit']}/{v['subs']} ({v['chf_novisit']} CHF)" for k, v in rev['members'].items()))
    if out['unmatched']:
        print(f"  {out['unmatched']} Klassen ohne Gegenstueck im Recurring-Report (keine Unique Users/Trainer)")
    print('Hitlist (Slot-Index, erst je Standort, dann Mittel):')
    for h in out['hitlist']:
        z, w = h.get('Zurich'), h.get('Winterthur')
        print(f"  {h['name']:<22} ZH {('%.2f' % z['index']) if z and z['index'] is not None else ' n/a' if z else '  - '}  WT {('%.2f' % w['index']) if w and w['index'] is not None else ' n/a' if w else '  - '}  Mittel {('%.2f' % h['index']) if h['index'] is not None else '  - '}"
              f"  Auslastung {h['util']:.0%}  Besuche {h['attended']:>4}  Termine {h['events']:>3}  mit Vergleich {h['with_neighbor']}")


if __name__ == '__main__':
    main()
