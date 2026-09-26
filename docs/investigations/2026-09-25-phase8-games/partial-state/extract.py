import json, sys, os, glob
W = sys.argv[1]; OUT = sys.argv[2]
starts = {}; results = {}
for l in open(os.path.join(W, 'journal.jsonl'), encoding='utf-8'):
    d = json.loads(l)
    if d.get('type') == 'started': starts[d['key']] = d
    elif d.get('type') == 'result': results[d['key']] = d.get('result')
plan = None; gap = None; tracks = {}; verdicts = {}; pending = []
for k, s in starts.items():
    lab = s['label']; r = results.get(k)
    if r is None: pending.append({'label': lab, 'agentId': s['agentId']}); continue
    if lab == 'fable:plan-investigation': plan = r
    elif lab == 'fable:gap-check': gap = r
    elif lab.startswith('investigate:'): tracks[lab.split(':',1)[1]] = r
    elif lab.startswith('verify:'): verdicts[lab.split(':',1)[1]] = {v['id']: v for v in r.get('verdicts', [])}
alltracks = (plan or {}).get('tracks', []) + (gap or {}).get('tracks', [])
findings = []
for t in alltracks:
    r = tracks.get(t['id'])
    if not r: continue
    vs = verdicts.get(t['id'])
    for f in r['findings']:
        v = (vs or {}).get(f['id'])
        f = dict(f, track=t['id'], verdict=(v['verdict'] if v else ('unverified' if vs is None else 'no verdict')),
                 verify_reasoning=(v or {}).get('reasoning',''), corrected_details=(v or {}).get('corrected_details',''))
        findings.append(f)
state = {'run_id': 'wf_2dafb802-1a5', 'stopped_at': 'investigation round 2 (user stop)', 'plan': plan, 'gap_check': gap,
         'track_results': {k: {'coverage_notes': v.get('coverage_notes'), 'n_findings': len(v['findings'])} for k, v in tracks.items()},
         'findings': findings, 'pending_agents': pending}
json.dump(state, open(os.path.join(OUT, 'state.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
# partial transcripts of pending agents: last assistant texts
for p in pending:
    fn = os.path.join(W, 'agent-%s.jsonl' % p['agentId']); texts = []
    for l in open(fn, encoding='utf-8'):
        try: d = json.loads(l)
        except: continue
        m = d.get('message') or {}
        if d.get('type') == 'assistant':
            for c in m.get('content', []) if isinstance(m.get('content'), list) else []:
                if c.get('type') == 'text' and c['text'].strip(): texts.append(c['text'])
    p['n_texts'] = len(texts)
    open(os.path.join(OUT, 'partial-%s.md' % p['label'].replace(':','-')), 'w', encoding='utf-8').write(
        '# Partial notes: %s (stopped before finishing)\n\n' % p['label'] + '\n\n---\n\n'.join(texts))
from collections import Counter
print('findings', len(findings), Counter(f['verdict'] for f in findings))
print('pending', [(p['label'], p['n_texts']) for p in pending])
for f in findings: print(f['verdict'][:4], f['severity'][:4], f['track'], '|', f['id'], '|', f['title'][:150])
