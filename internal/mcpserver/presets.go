package mcpserver

// The card designer's presets, listed so an outside agent can talk about them (for example "use the Article cover
// layout"). They are read-only: an agent can never choose them, because the person picks the design. A test compares
// these tables with the web app's own definitions so they cannot quietly drift apart.

// Preset is a layout or a background.
type Preset struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Hint string `json:"hint"`
}

// SizeInfo is an image size for a network.
type SizeInfo struct {
	ID      string `json:"id"`
	Network string `json:"network"`
	Name    string `json:"name"`
	Width   int    `json:"width"`
	Height  int    `json:"height"`
}

var layouts = []Preset{
	{"hero", "Hero", "Text left, art right"},
	{"center", "Centred", "Big centred title"},
	{"cover", "Article cover", "Series tag + title"},
	{"quote", "Quote", "Big quote + author"},
	{"stat", "Big number", "One stat that matters"},
	{"split", "Headshot", "Your photo + title"},
	{"greeting", "Greeting", "Centred wish with a sign-off"},
}

var backgrounds = []Preset{
	{"constellation", "Constellation", "Hub and nodes – agents, architecture"},
	{"dots", "Dot grid", "Clean tech look"},
	{"code", "Code lines", "Coding and dev tools"},
	{"bars", "Rising bars", "Metrics and benchmarks"},
	{"geometric", "Geometric", "Brand tiles, no photos needed"},
	{"contours", "Contours", "Article covers"},
	{"mesh", "Gradient mesh", "Announcements and quotes"},
	{"mosaic", "Photo mosaic", "Your photos in tiles"},
	{"browser", "Browser frame", "Show an app screenshot"},
	{"image", "Own image", "Your image with colour overlay"},
	{"plain", "Plain", "Just colour"},
}

var sizes = []SizeInfo{
	{"li-post", "LinkedIn", "Post image", 1200, 627},
	{"li-square", "LinkedIn", "Square", 1200, 1200},
	{"li-portrait", "LinkedIn", "Portrait", 1080, 1350},
	{"x-post", "X", "Post image", 1600, 900},
	{"x-square", "X", "Square", 1080, 1080},
	{"ig-square", "Instagram", "Square", 1080, 1080},
	{"ig-portrait", "Instagram", "Portrait", 1080, 1350},
	{"ig-story", "Instagram", "Story", 1080, 1920},
	{"fb-post", "Facebook", "Feed post", 1200, 630},
	{"fb-square", "Facebook", "Square", 1080, 1080},
}
