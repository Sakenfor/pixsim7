# Unified Task & Agent Architecture

Last updated: 2026-03-16
Owner: platform lane
Status: active
Stage: foundation_complete

## Goal

Unify dev plans and user tasks into a single task model served by the same agent infrastructure. Dev agents work on code plans, user agents work on asset/scene/generation tasks — same dispatch, same tracking, same meta API.

## Current State (Foundation)

What exists as of 2026-03-16:

### Agent Infrastructure
- **Agent bridge**: WebSocket-based, Claude CLI managed sessions (pixsim7/client/)
- **Agent pool**: Multi-session with health monitoring and auto-restart
- **Per-user bridges**: Auth-scoped WebSocket connections, user routes to own bridge first, shared fallback
- **Heartbeat system**: In-memory presence (live) + DB persistence (agent_activity_log)
- **Agent observability panel**: Contract graph with live agent overlay, session list, history, stats

### Plan Management (Dev Tasks)
- **DB-first plans**: PlanRegistry with full markdown, companions, handoffs
- **Plan actions**: Status/stage/priority changes via API with git commit-back
- **Plan documents**: Companion/handoff markdown stored in DB (PlanDocument)
- **Agent context**: GET /dev/plans/agent-context returns assignment + docs + available actions

### Meta Contract Graph
- 7 contracts: prompts.analysis, prompts.authoring, blocks.discovery, plans.management, devtools.codegen, ui.catalog, user.assistant
- Navigable graph with provides/relates_to links
- Live agent presence overlay per contract node
- User assistant contract: 8 endpoints covering assets, generations, scenes, characters

### User-Facing
- **AI Assistant panel**: Floating chat with shortcuts, available in sidebar
- **Activity bar widget**: Connection status dot, opens assistant panel
- **Launcher GUI widget**: Start/stop/resume sessions with PID persistence

## Phases

### Phase 1: Foundation (DONE)
- [x] Agent bridge + pool + WebSocket dispatch
- [x] Plans in DB with write-back
- [x] Meta contract graph with agent presence
- [x] AI Assistant panel for users
- [x] Launcher integration
- [x] Per-user bridge auth

### Phase 2: Unified Task Model
- [ ] Create unified tasks table (scope: plan/user/system)
- [ ] Migrate PlanRegistry to use tasks table or extend it
- [ ] User tasks: created from assistant panel interactions
- [ ] Task lifecycle: pending -> assigned -> active -> done
- [ ] Agent auto-assignment based on task priority and scope

### Phase 3: User Task Flows
- [ ] Asset editing tasks: "enhance this image", "add variations"
- [ ] Generation tasks: "generate 5 scene variants"
- [ ] Scene tasks: "set up lighting for this scene"
- [ ] Character tasks: "create outfit variations"
- [ ] Task results linked to produced assets/generations

### Phase 4: Agent Intelligence
- [ ] Agent reads task context (linked assets, scenes, previous results)
- [ ] Agent uses meta contract graph to discover available tools
- [ ] Multi-step task execution with checkpoints
- [ ] Task handoff between agents (user agent -> dev agent for complex requests)

### Phase 5: Settings & Configuration
- [ ] User profile: agent preferences, default model, bridge settings
- [ ] Admin: manage shared bridges, view all user sessions
- [ ] Per-user task history and analytics
- [ ] Cost tracking per user per task

## Architecture Decision

Tasks are the universal unit of work. The difference between a dev plan and a user request is scope and permissions, not structure. The agent infrastructure (bridge, dispatch, heartbeat, observability) serves both equally.

## Code Paths
- pixsim7/client/ (agent bridge + pool)
- pixsim7/backend/main/services/llm/remote_cmd_bridge.py
- pixsim7/backend/main/services/meta/agent_sessions.py
- pixsim7/backend/main/services/meta/contract_registry.py
- pixsim7/backend/main/services/docs/plan_write.py
- pixsim7/backend/main/api/v1/meta_contracts.py
- pixsim7/backend/main/api/v1/ws_agent_cmd.py
- pixsim7/backend/main/api/v1/dev_plans.py
- pixsim7/backend/main/domain/docs/models.py
- apps/main/src/features/panels/components/dev/AgentObservabilityPanel.tsx
- apps/main/src/features/panels/components/helpers/AIAssistantPanel.tsx
- apps/main/src/features/devtools/components/AgentActivityBarWidget.tsx
- launcher/gui/widgets/ai_agents_widget.py
