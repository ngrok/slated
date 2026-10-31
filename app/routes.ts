import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
	index("routes/home.tsx"),
	route("api/issues", "routes/api.issues.tsx"),
	route("api/issue", "routes/api.issue.tsx"),
	route("api/projects", "routes/api.projects.tsx"),
	route("api/labels", "routes/api.labels.tsx"),
	route("api/teams", "routes/api.teams.tsx"),
	route("api/states", "routes/api.states.tsx"),
	route("api/members", "routes/api.members.tsx"),
] satisfies RouteConfig;
