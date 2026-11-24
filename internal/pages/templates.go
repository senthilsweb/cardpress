package pages

const css = `:root{color-scheme:light dark;--bg:#fbf6ea;--ink:#1a1712;--muted:#6b6a55;--line:#e6dcc0;--brand:#0e6b57;--code:#f1e9d2}
@media (prefers-color-scheme:dark){:root{--bg:#0c1f1c;--ink:#f4ead0;--muted:#9bb0a7;--line:#1f3b35;--brand:#3cc4a0;--code:#112a26}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:18px/1.7 Georgia,"Iowan Old Style",serif}
a{color:var(--brand)}header,footer{max-width:46rem;margin:0 auto;padding:1.2rem 1.25rem;font:600 .85rem/1.4 system-ui,sans-serif;display:flex;gap:1.2rem;flex-wrap:wrap;align-items:baseline}
header a{text-decoration:none;color:var(--ink)}header .brand{font-size:1rem;margin-right:auto}footer{color:var(--muted);font-weight:400;border-top:1px solid var(--line);margin-top:3rem}
main{max-width:46rem;margin:0 auto;padding:0 1.25rem}h1{font:700 2.1rem/1.2 system-ui,sans-serif;margin:1.2rem 0 .4rem}h2{font:700 1.5rem/1.3 system-ui,sans-serif;margin:2rem 0 .4rem}h3{font:700 1.2rem/1.3 system-ui,sans-serif;margin:1.6rem 0 .3rem}
.meta{color:var(--muted);font:.9rem/1.5 system-ui,sans-serif;margin:0 0 1.2rem}.cover{width:100%;height:auto;border-radius:10px;border:1px solid var(--line);display:block;margin:0 0 1.5rem}
figure{margin:1.4rem 0}figure img{max-width:100%;height:auto;border-radius:8px;display:block;margin:0 auto}blockquote{margin:1.2rem 0;padding:.1rem 1rem;border-left:3px solid var(--brand);color:var(--muted)}
pre{background:var(--code);padding:.9rem 1rem;border-radius:8px;overflow:auto;font-size:.85rem;line-height:1.5}code{font-family:ui-monospace,Menlo,monospace;font-size:.88em;background:var(--code);padding:.1em .3em;border-radius:4px}pre code{background:none;padding:0}
.table{overflow-x:auto}table{border-collapse:collapse;font:.9rem/1.5 system-ui,sans-serif;margin:1.2rem 0;width:100%}td,th{border:1px solid var(--line);padding:.4rem .6rem;vertical-align:top;text-align:left}th{background:var(--code)}
hr{border:0;border-top:1px solid var(--line);margin:2rem 0}.tags{color:var(--brand);font:.95rem system-ui,sans-serif}
ul.items{list-style:none;padding:0;margin:1rem 0}ul.items li{display:flex;gap:1rem;padding:1.1rem 0;border-top:1px solid var(--line)}ul.items img{width:9rem;height:auto;border-radius:6px;border:1px solid var(--line);align-self:flex-start;flex:none}
ul.items h2{font-size:1.2rem;margin:0}ul.items p{margin:.25rem 0 0;color:var(--muted);font:.95rem/1.5 system-ui,sans-serif}nav.pages{display:flex;gap:1rem;font:600 .9rem system-ui,sans-serif;margin:1.5rem 0}
@media (max-width:560px){ul.items{}ul.items li{flex-direction:column}ul.items img{width:100%}}`

const head = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{if .Site}}{{.Title}} · {{.Site}}{{else}}{{.Title}}{{end}}</title>
<meta name="description" content="{{.Description}}">
<link rel="canonical" href="{{.Canonical}}">
<meta name="robots" content="{{.Robots}}">
<meta name="generator" content="CardPress">
<meta property="og:site_name" content="{{.Site}}"><meta property="og:title" content="{{.Title}}"><meta property="og:description" content="{{.Description}}"><meta property="og:url" content="{{.Canonical}}">
`

const pageTmpl = head + `<meta property="og:type" content="article">
{{if .Published}}<meta property="article:published_time" content="{{.Published}}">{{end}}{{if .Modified}}<meta property="article:modified_time" content="{{.Modified}}">{{end}}
{{range .Tags}}<meta property="article:tag" content="{{.}}">
{{end}}{{if .HasCover}}<meta property="og:image" content="{{.Cover}}">{{if .CoverW}}<meta property="og:image:width" content="{{.CoverW}}"><meta property="og:image:height" content="{{.CoverH}}">{{end}}<meta property="og:image:alt" content="{{.CoverAlt}}">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="{{.Cover}}">{{else}}<meta name="twitter:card" content="summary">{{end}}
<meta name="twitter:title" content="{{.Title}}"><meta name="twitter:description" content="{{.Description}}">
<script type="application/ld+json">{{.JSONLD}}</script>
<style>` + css + `</style></head><body>
<header><a class="brand" href="/{{.Section}}">{{if .Site}}{{.Site}}{{else}}CardPress{{end}}</a><a href="/articles">Articles</a><a href="/posts">Posts</a></header>
<main><article>
{{if .HasCover}}<img class="cover" src="/{{.Section}}/{{.Slug}}/cover.png" alt="{{.CoverAlt}}"{{if .CoverW}} width="{{.CoverW}}" height="{{.CoverH}}"{{end}}>{{end}}
<h1>{{.Title}}</h1>
<p class="meta">{{if .Author}}{{.Author}}{{if .Handle}} · {{.Handle}}{{end}} · {{end}}<time datetime="{{.Published}}">{{date .Published}}</time></p>
{{.Body}}
{{if .Tags}}<p class="tags">{{range .Tags}}#{{.}} {{end}}</p>{{end}}
</article></main>
<footer><span>{{if .Website}}<a href="{{.Website}}" rel="noopener">{{.Website}}</a>{{else}}&nbsp;{{end}}</span></footer>
</body></html>
`

const indexTmpl = head + `<meta property="og:type" content="website">
{{if .Prev}}<link rel="prev" href="{{.Prev}}">{{end}}{{if .Next}}<link rel="next" href="{{.Next}}">{{end}}
<style>` + css + `</style></head><body>
<header><a class="brand" href="/{{.Section}}">{{if .Site}}{{.Site}}{{else}}CardPress{{end}}</a><a href="/articles">Articles</a><a href="/posts">Posts</a></header>
<main>
<h1>{{.Title}}</h1>
<p class="meta">{{.Total}} {{if eq .Total 1}}page{{else}}pages{{end}}</p>
{{if .Items}}<ul class="items">
{{range .Items}}<li>{{if .Cover}}<a href="{{.URL}}"><img src="{{.Cover}}" alt="" loading="lazy" width="288" height="150"></a>{{end}}<div><h2><a href="{{.URL}}">{{.Title}}</a></h2><p class="meta" style="margin:.2rem 0"><time datetime="{{.Published}}">{{date .Published}}</time></p><p>{{.Description}}</p></div></li>
{{end}}</ul>
<nav class="pages" aria-label="Pages">{{if .Prev}}<a rel="prev" href="{{.Prev}}">← Newer</a>{{end}}<span>Page {{.Page}} of {{.Pages}}</span>{{if .Next}}<a rel="next" href="{{.Next}}">Older →</a>{{end}}</nav>
{{else}}<p>Nothing is published here yet.</p>{{end}}
</main><footer></footer></body></html>
`
