package service

// FieldSpec describes one credential field.
type FieldSpec struct {
	Key    string
	Label  string
	Hint   string
	Env    string // environment variable suffix: CARDPRESS_<NETWORK>_<Env>
	Secret bool   // shown masked; identifiers (IDs, URNs) are shown in full
}

// NetworkSpec describes one social network the studio can hold credentials for.
type NetworkSpec struct {
	ID        string
	Name      string
	PortalURL string
	Testable  bool // there is a working "test connection"
	Fields    []FieldSpec
}

// Networks lists the supported networks in display order. Only LinkedIn can be tested (and, later, published to).
var Networks = []NetworkSpec{
	{
		ID: "linkedin", Name: "LinkedIn", PortalURL: "https://www.linkedin.com/developers/apps", Testable: true,
		Fields: []FieldSpec{
			{Key: "clientId", Label: "Client ID", Env: "CLIENT_ID", Hint: "From your app's Auth tab."},
			{Key: "clientSecret", Label: "Client secret", Env: "CLIENT_SECRET", Secret: true, Hint: "From your app's Auth tab."},
			{Key: "accessToken", Label: "Access token", Env: "ACCESS_TOKEN", Secret: true, Hint: "A member token with the w_member_social scope (w_organization_social to post as a page). Tokens expire, usually after about 60 days."},
			{Key: "authorUrn", Label: "Author URN", Env: "AUTHOR_URN", Hint: "Who posts: urn:li:person:… for you, or urn:li:organization:… for a page."},
		},
	},
	{
		ID: "x", Name: "X", PortalURL: "https://developer.x.com/en/portal/dashboard",
		Fields: []FieldSpec{
			{Key: "apiKey", Label: "API key", Env: "API_KEY"},
			{Key: "apiSecret", Label: "API secret", Env: "API_SECRET", Secret: true},
			{Key: "accessToken", Label: "Access token", Env: "ACCESS_TOKEN", Secret: true},
			{Key: "accessTokenSecret", Label: "Access token secret", Env: "ACCESS_TOKEN_SECRET", Secret: true},
		},
	},
	{
		ID: "instagram", Name: "Instagram", PortalURL: "https://developers.facebook.com/apps/",
		Fields: []FieldSpec{
			{Key: "appId", Label: "App ID", Env: "APP_ID"},
			{Key: "appSecret", Label: "App secret", Env: "APP_SECRET", Secret: true},
			{Key: "accessToken", Label: "Long-lived access token", Env: "ACCESS_TOKEN", Secret: true, Hint: "Needs an Instagram Business or Creator account linked to a Facebook Page."},
			{Key: "businessAccountId", Label: "Business account ID", Env: "BUSINESS_ACCOUNT_ID"},
		},
	},
}

func networkByID(id string) (NetworkSpec, bool) {
	for _, n := range Networks {
		if n.ID == id {
			return n, true
		}
	}
	return NetworkSpec{}, false
}
