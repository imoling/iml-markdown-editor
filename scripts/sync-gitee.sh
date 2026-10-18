#!/usr/bin/env bash
# 把 GitHub 上的发布同步到 Gitee：标题、说明、预发布标记和安装包。
# 用法：GITEE_TOKEN=... GH_TOKEN=... GITHUB_REPO=owner/repo GITEE_REPO=owner/repo scripts/sync-gitee.sh [标签…]
#
# 不给标签：同步全部发布的说明，安装包只放最新一个发布（Gitee 附件容量有限），
#           旧发布上之前传过的安装包会删掉，说明末尾附上 GitHub 下载地址。
# 给了标签：只同步这些发布，安装包都传。
# 单个文件超过 GITEE_MAX_MB（默认 100）的跳过，改附 GitHub 下载地址。
# 可重复跑：已有的发布只更新说明，已有的同名附件不再上传。标签要先推到 Gitee。
set -euo pipefail

: "${GITEE_TOKEN:?缺少 GITEE_TOKEN}"
: "${GITHUB_REPO:?缺少 GITHUB_REPO}"
: "${GITEE_REPO:?缺少 GITEE_REPO}"
MAX_BYTES=$(( ${GITEE_MAX_MB:-100} * 1024 * 1024 ))
API="https://gitee.com/api/v5/repos/$GITEE_REPO"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

if [ $# -gt 0 ]; then
  tags=("$@")
  with_assets=("$@")
else
  tags=()
  while IFS= read -r t; do tags+=("$t"); done < <(gh release list -R "$GITHUB_REPO" --limit 200 --exclude-drafts --json tagName -q '.[].tagName')
  [ ${#tags[@]} -gt 0 ] || { echo "GitHub 上没有发布"; exit 0; }
  with_assets=("${tags[0]}")
fi

failed=0
for tag in "${tags[@]}"; do
  echo "== $tag"
  gh release view "$tag" -R "$GITHUB_REPO" --json name,body,isPrerelease,url,assets > "$WORK/gh.json"
  name=$(jq -r '.name // empty' "$WORK/gh.json")
  [ -n "$name" ] || name=$tag
  body=$(jq -r '.body // empty' "$WORK/gh.json")
  pre=$(jq -r .isPrerelease "$WORK/gh.json")
  url=$(jq -r .url "$WORK/gh.json")
  upload=false
  for t in "${with_assets[@]}"; do [ "$t" = "$tag" ] && upload=true; done

  # 有安装包没放到 Gitee 时，说明末尾附上 GitHub 下载地址
  n_assets=$(jq '.assets | length' "$WORK/gh.json")
  n_big=$(jq --argjson m "$MAX_BYTES" '[.assets[] | select(.size > $m)] | length' "$WORK/gh.json")
  if [ "$n_assets" -gt 0 ] && { [ "$upload" = false ] || [ "$n_big" -gt 0 ]; }; then
    link="安装包下载：$url"
    if [ -n "$body" ]; then body=$(printf '%s\n\n---\n%s\n' "$body" "$link"); else body=$link; fi
  fi
  [ -n "$body" ] || body=$name   # Gitee 要求说明非空

  existing=$(curl -sS "$API/releases/tags/$tag?access_token=$GITEE_TOKEN")
  id=$(jq -r 'if type == "object" then .id // empty else empty end' <<<"$existing")
  if [ -z "$id" ]; then
    resp=$(curl -sS -X POST "$API/releases" \
      --data-urlencode "access_token=$GITEE_TOKEN" \
      --data-urlencode "tag_name=$tag" \
      --data-urlencode "name=$name" \
      --data-urlencode "body=$body" \
      --data-urlencode "prerelease=$pre" \
      --data-urlencode "target_commitish=$tag")
    id=$(jq -r 'if type == "object" then .id // empty else empty end' <<<"$resp")
    [ -n "$id" ] || { echo "创建发布失败：$resp"; failed=1; continue; }
    echo "已创建发布 $id"
  else
    curl -sS -o /dev/null -X PATCH "$API/releases/$id" \
      --data-urlencode "access_token=$GITEE_TOKEN" \
      --data-urlencode "tag_name=$tag" \
      --data-urlencode "name=$name" \
      --data-urlencode "body=$body" \
      --data-urlencode "prerelease=$pre"
    echo "已更新发布 $id"
  fi

  curl -sS "$API/releases/$id/attach_files?access_token=$GITEE_TOKEN&per_page=100" \
    | jq -r 'if type == "array" then .[] | "\(.id)\t\(.name)" else empty end' > "$WORK/have.tsv"

  if [ "$upload" = false ]; then
    while IFS=$'\t' read -r aid aname; do
      curl -sS -o /dev/null -X DELETE "$API/releases/$id/attach_files/$aid?access_token=$GITEE_TOKEN"
      echo "  已删除旧安装包 $aname"
    done < "$WORK/have.tsv"
    continue
  fi

  rm -rf "$WORK/assets" && mkdir "$WORK/assets"
  [ "$n_assets" -gt 0 ] && gh release download "$tag" -R "$GITHUB_REPO" -D "$WORK/assets"
  for f in "$WORK/assets"/*; do
    [ -e "$f" ] || continue
    base=$(basename "$f")
    if cut -f2 "$WORK/have.tsv" | grep -qxF "$base"; then
      echo "  跳过 ${base}（已有）"
    elif [ "$(stat -c %s "$f" 2>/dev/null || stat -f %z "$f")" -gt "$MAX_BYTES" ]; then
      echo "  跳过 ${base}（超过 ${GITEE_MAX_MB:-100} MB，附 GitHub 地址）"
    else
      resp=$(curl -sS -X POST "$API/releases/$id/attach_files" \
        -F "access_token=$GITEE_TOKEN" -F "file=@$f")
      if jq -e '.id' <<<"$resp" >/dev/null 2>&1; then
        echo "  已上传 $base"
      else
        echo "  上传失败 ${base}：$resp"
        failed=1
      fi
    fi
  done
done
exit $failed
