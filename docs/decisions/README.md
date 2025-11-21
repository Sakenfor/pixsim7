# Architecture Decision Records (ADRs)

This folder contains **Architecture Decision Records** for PixSim7.

ADRs capture **important, long‑lived decisions** that shape the system, in a format that is:

- Short and focused (1–2 pages).
- Linked to code and primary docs.
- Stable over time, even as implementation details change.

ADRs are **not**:

- Full design documents.
- Task/roadmap files.
- Status reports.

They answer: "Given the context at the time, why did we choose this direction, and what trade‑offs did we accept?"

---

## When to Create an ADR

### ✅ Create an ADR When:

1. **Extension Surface Changes**
   - Introducing or changing plugin capability models
   - Adding new registries or extension points
   - Modifying how plugins/extensions are discovered or loaded
   - Example: Backend plugin auto-discovery, frontend plugin system

2. **Core Convention Changes**
   - Changing how `GameSession.flags`/`relationships` are structured
   - Modifying JSON schema conventions for game state
   - Altering fundamental data models (Asset, Job, Scene, etc.)
   - Example: Game session JSON conventions, scene graph structure

3. **Major Architectural Choices**
   - New provider architecture patterns
   - Scheduler or worker model changes
   - Narrative runtime semantics
   - Database schema evolution strategies
   - Example: Cross-provider asset system, ARQ worker architecture

4. **API Changes with Broad Impact**
   - Deprecating major APIs that others depend on
   - Breaking changes to public service interfaces
   - Changes to authentication/authorization model
   - Example: JWT authentication model, service layer patterns

5. **Technology Choices**
   - Adopting new major dependencies
   - Choosing between competing frameworks
   - Database technology decisions
   - Example: PostgreSQL + pgvector, FastAPI + SQLModel, React 19

### ❌ Don't Create ADRs For:

- Small refactors contained to single modules
- Bug fixes (even complex ones)
- UI tweaks and styling changes
- Adding new features using existing patterns
- Internal implementation details that don't affect external interfaces
- Temporary workarounds or experiments

### 🤔 Unsure? Ask These Questions:

1. Will this decision affect how others extend the system?
2. Will future developers need to understand **why** this choice was made?
3. Were there significant trade-offs or alternatives considered?
4. Is this a one-way door (hard to reverse) or two-way door (easy to reverse)?
5. Does this establish a pattern others should follow?

**If you answered "yes" to 2+ questions, create an ADR.**

---

## ADR Lifecycle & Process

### Creating an ADR

1. **Draft the ADR**
   ```bash
   # Use date format: YYYYMMDD-short-title.md
   # Date is when decision was made, not when doc was written
   touch docs/decisions/20251121-my-architectural-decision.md
   ```

2. **Use the Template**
   - Copy structure from `TEMPLATE.md`
   - Fill in all sections:
     - **Context**: What problem? What constraints? What alternatives?
     - **Decision**: What are we doing? What are we NOT doing?
     - **Consequences**: Benefits, trade-offs, risks, migration strategy
     - **Related Code/Docs**: Links to implementation and related docs

3. **Set Status**
   - **Proposed**: Draft, seeking feedback
   - **Accepted**: Decision made, implementation in progress or complete
   - **Superseded**: Replaced by newer ADR (link to it)

4. **Review Process**
   - Share with team members who will be affected
   - Incorporate feedback into Context and Consequences
   - Consider alternatives and document why they were rejected
   - Get approval from technical lead or architect

5. **Link from Related Docs**
   - Add reference in `ARCHITECTURE.md` if it affects system architecture
   - Link from relevant guide docs (`PLUGIN_DEVELOPER_GUIDE.md`, etc.)
   - Add inline comments in code pointing to ADR for complex patterns

### Accepting an ADR

An ADR is **Accepted** when:
- Implementation is underway or complete
- Team has reviewed and agreed
- Technical lead has approved

**Mark as Accepted by:**
- Changing status from "Proposed" to "Accepted"
- Adding implementation date if different from decision date
- Creating the entry below in this README

### Living with ADRs

Once **Accepted**, ADRs are **immutable**:
- ❌ Don't edit the decision or context
- ❌ Don't rewrite history to match current thinking
- ✅ Do add dated amendments at the end if critical clarification needed
- ✅ Do create a new ADR that supersedes the old one if the decision changes

### Superseding an ADR

When a decision needs to change:

1. **Create New ADR**
   - New file with new date: `20251201-revised-plugin-architecture.md`
   - Reference the old ADR in Context section
   - Explain why the original decision is being changed

2. **Update Old ADR**
   - Change status to "Superseded"
   - Add link at top: `**Superseded by:** [ADR-20251201](20251201-revised-plugin-architecture.md)`
   - Don't modify the original content

3. **Update Related Docs**
   - Update `ARCHITECTURE.md` and other docs to reference new ADR
   - Keep old ADR in `docs/decisions/` for historical context

---

## ADR Index

### Active ADRs

| Date | Title | Status | Summary |
|------|-------|--------|---------|
| 2025-11-21 | [Extension Architecture](20251121-extension-architecture.md) | Accepted | Unified extension system with backend/frontend plugins, graph extensions, and JSON-based game state |
| 2025-11-21 | [Cross-Provider Asset System](20251121-cross-provider-asset-system.md) | Accepted | Automatic upload/download/cache system for assets across providers with lineage tracking |
| 2025-11-21 | [Structured Logging System](20251121-structured-logging-system.md) | Accepted | JSON structured logging with field catalog, stage taxonomy, and database ingestion |

### Superseded ADRs

| Date | Title | Superseded By | Reason |
|------|-------|---------------|--------|
| _(none yet)_ | | | |

---

## Naming Conventions

### File Names
- Format: `YYYYMMDD-short-kebab-case-title.md`
- Date: When decision was made (not when doc was written)
- Title: 3-6 words describing the decision
- Examples:
  - ✅ `20251121-extension-architecture.md`
  - ✅ `20251121-cross-provider-asset-system.md`
  - ❌ `adr-001-extension-architecture.md` (don't use ADR numbers)
  - ❌ `extension-architecture.md` (missing date)

### Status Values
- **Proposed** - Draft, under review
- **Accepted** - Decision finalized, implemented or in progress
- **Superseded** - Replaced by newer ADR (must link to replacement)

### Section Structure
Every ADR must have:
1. **Header** - Title, date, status, authors
2. **Context** - Problem, constraints, alternatives
3. **Decision** - What we're doing, what we're not doing
4. **Consequences** - Benefits, trade-offs, risks, migration
5. **Related Code/Docs** - Implementation references

---

## How ADRs Relate to Other Documentation

ADRs **complement but don't replace** other documentation:

### ARCHITECTURE.md
- **What it is:** Current state of the system
- **When to update:** System changes
- **Relationship:** ADRs explain **why** the architecture evolved to its current state

### DEVELOPMENT_GUIDE.md
- **What it is:** How to work with the system
- **When to update:** Workflow changes
- **Relationship:** ADRs document **why** certain workflows exist

### docs/backend/, docs/frontend/
- **What it is:** Implementation reference
- **When to update:** Feature changes
- **Relationship:** ADRs provide context for **why** implementations work the way they do

### GAMEPLAY_SYSTEMS.md
- **What it is:** Game mechanics and session structure
- **When to update:** Game system changes
- **Relationship:** ADRs explain **why** game conventions were chosen

### claude-tasks/*.md
- **What it is:** Active work tracking
- **When to update:** Task progress
- **Relationship:** ADRs document **decisions made** during task execution

---

## Examples of Good ADR Topics

### Backend
- Provider adapter architecture and interface contracts
- Database migration strategy (Alembic conventions)
- Service layer dependency injection patterns
- Background worker architecture (ARQ setup and job patterns)
- Authentication and authorization model
- API versioning strategy

### Frontend
- Component architecture and state management
- Module system design and plugin loading
- Layout system (DockLayout patterns)
- Asset display and interaction patterns
- WebSocket communication strategy

### Game Systems
- Scene graph structure and navigation
- Game session JSON conventions
- Relationship and flag systems
- Progression and branching logic
- Mini-game integration patterns

### Cross-Cutting
- Extension architecture (plugins, registries)
- Structured logging field catalog and taxonomy
- Cross-provider asset upload/download strategy
- Testing strategy and coverage goals
- Error handling and retry patterns

---

## Tips for Writing Effective ADRs

### Context Section
- **Be specific** about the problem you're solving
- **List alternatives** you considered and why they were rejected
- **Identify constraints** that influenced the decision
- **Reference prior art** or similar systems if helpful

### Decision Section
- **State clearly** what you decided to do
- **Be explicit** about what you're NOT doing
- **Define invariants** or contracts the decision establishes
- **Call out extension points** if the decision creates them

### Consequences Section
- **Be honest** about trade-offs and limitations
- **Identify risks** and how you'll mitigate them
- **Document migration** if there's existing code to update
- **Note future work** if the decision opens new possibilities

### Related Code/Docs
- **Link to key files** that implement the decision
- **Reference related docs** that provide more detail
- **List other ADRs** that this one depends on or supersedes

---

## Reviewing ADRs

### As a Reviewer, Check For:

1. **Clarity**
   - Is the problem clearly stated?
   - Is the decision unambiguous?
   - Would someone unfamiliar with the context understand it?

2. **Completeness**
   - Are alternatives documented?
   - Are trade-offs honestly assessed?
   - Are risks identified?
   - Is migration strategy included if needed?

3. **Consistency**
   - Does it align with existing architectural principles?
   - Does it conflict with other ADRs?
   - Does it follow naming and structure conventions?

4. **Actionability**
   - Can developers implement based on this ADR?
   - Are related code/docs linked?
   - Is the scope appropriate (not too broad, not too narrow)?

### Feedback Examples

- ✅ "Can you add more detail on why we rejected alternative B?"
- ✅ "What's the migration strategy for existing components?"
- ✅ "Should we link to the provider adapter interface in Related Code?"
- ❌ "I don't like this decision" (explain why with technical reasoning)
- ❌ "Rewrite this to match current implementation" (ADRs capture decision at the time)

---

## For AI Assistants

When working with ADRs:

1. **Check existing ADRs** before proposing architectural changes
2. **Create ADRs** for major architectural decisions (follow checklist above)
3. **Reference ADRs** in code comments for complex patterns
4. **Never modify accepted ADRs** - create new ones that supersede
5. **Update ADR index** in this README when creating new ADRs
6. **Link ADRs** from ARCHITECTURE.md and other relevant docs

---

## Questions?

- **Can I modify an accepted ADR?** No, create a new ADR that supersedes it
- **How long should an ADR be?** 1-2 pages typically, longer if needed for clarity
- **Do I need approval to create an ADR?** No, but get feedback before marking as Accepted
- **What if my decision was wrong?** That's okay! Document it, create new ADR, move forward
- **Can ADRs have code examples?** Yes, if it helps clarify the decision

---

ADRs live alongside, and **do not replace**:

- `ARCHITECTURE.md`, `GAMEPLAY_SYSTEMS.md`, `docs/APP_MAP.md` (canonical overviews)
- System‑specific docs under `docs/backend/`, `docs/frontend/`, etc.
- Task/roadmap files in `claude-tasks/`

**Last Updated:** 2025-11-21

