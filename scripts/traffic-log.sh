#!/bin/zsh
# 抓一次 GitHub 流量快照，追加到 docs/traffic-log.md。
# GitHub 的流量数据只保留 14 天，不定期抓就永久丢了——每周一跑一次。
# 用法：./scripts/traffic-log.sh
set -e
cd "$(dirname "$0")/.."
TOKEN=$(printf 'protocol=https\nhost=github.com\n\n' | git credential fill 2>/dev/null | grep '^password=' | cut -d= -f2-)
[ -z "$TOKEN" ] && { echo '取不到 GitHub token（git credential fill）'; exit 1; }
python3 - "$TOKEN" <<'PY'
import sys, json, urllib.request, datetime, pathlib
t = sys.argv[1]
def get(repo, path):
    req = urllib.request.Request(f'https://api.github.com/repos/imoling/{repo}{path}',
        headers={'Authorization': f'Bearer {t}', 'Accept': 'application/vnd.github+json'})
    try: return json.load(urllib.request.urlopen(req, timeout=30))
    except Exception: return {}
today = datetime.date.today().isoformat()
lines = [f'\n## {today}\n']
for repo in ['iml-markdown-editor', 'iml-editor-lite']:
    v, c, r = get(repo, '/traffic/views'), get(repo, '/traffic/clones'), get(repo, '')
    refs = get(repo, '/traffic/popular/referrers') or []
    dl = 0
    for rel in get(repo, '/releases?per_page=10') or []:
        if isinstance(rel, dict): dl += sum(a['download_count'] for a in rel.get('assets', []))
    lines.append(f"**{repo}** — star {r.get('stargazers_count','?')} ｜ 两周浏览 {v.get('count','?')} 次 / {v.get('uniques','?')} 人"
                 f" ｜ 克隆 {c.get('uniques','?')} 人 ｜ 近十版下载 {dl}")
    if refs:
        lines.append('  来源：' + '、'.join(f"{x['referrer']} {x['uniques']}" for x in refs[:6]))
    lines.append('')
p = pathlib.Path('docs/traffic-log.md')
if not p.exists():
    p.write_text('# 流量记录\n\nGitHub 的流量数据只保留 14 天，这里每周存一份快照。\n用 `./scripts/traffic-log.sh` 追加。\n', encoding='utf-8')
with p.open('a', encoding='utf-8') as f: f.write('\n'.join(lines))
print('\n'.join(lines))
PY
