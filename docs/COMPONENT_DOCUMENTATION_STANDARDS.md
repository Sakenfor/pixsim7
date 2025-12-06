# Component Documentation Standards

**Last Updated**: 2025-12-06

This guide establishes standards for documenting React components, libraries, and subsystems in the PixSim7 frontend codebase.

## Overview

Component documentation serves multiple audiences:
- **New developers** learning the codebase
- **Component consumers** integrating the component into their features
- **Maintainers** understanding architectural decisions and implementation details

## Documentation Types

### 1. Component README.md

**Location**: `apps/main/src/components/{category}/README.md`

**Purpose**: Explain component purpose, usage, and integration

**Required sections**:
- Overview - What the component does
- Usage - How to use it (code examples)
- Props/API - Component interface
- Examples - Common use cases
- Related Documentation - Links to relevant docs

**Optional sections**:
- Architecture - Design decisions (for complex components)
- Migration - Upgrade guides (for breaking changes)
- Troubleshooting - Common issues and solutions

**Example**: `apps/main/src/components/generation/README.md` (295 lines)

### 2. Library README.md

**Location**: `apps/main/src/lib/{library}/README.md`

**Purpose**: Document library functionality, patterns, and API

**Required sections**:
- Overview - Library purpose and scope
- Core Concepts - Key abstractions and patterns
- API Reference - Functions, classes, types
- Usage Examples - Integration patterns
- Related Documentation - Cross-references

**Optional sections**:
- Architecture - Design principles
- Extension Points - How to extend the library
- Performance - Optimization guidelines
- Testing - Testing strategies

**Example**: `apps/main/src/lib/README.md` (212 lines)

### 3. Integration Guides

**Location**: `apps/main/src/{component-or-lib}/INTEGRATION_GUIDE.md`

**Purpose**: Step-by-step integration instructions for complex systems

**Required sections**:
- Quick Start - Minimal integration
- Step-by-Step Guide - Detailed integration walkthrough
- Configuration - Available options
- Examples - Real-world integration examples
- Troubleshooting - Common integration issues

**Example**: `apps/main/src/lib/overlay/INTEGRATION_GUIDE.md` (364 lines)

### 4. Demo/Tutorial Guides

**Location**: `apps/main/src/{component-or-lib}/DEMO_GUIDE.md`

**Purpose**: Interactive demos and tutorials

**Required sections**:
- Overview - What will be demonstrated
- Prerequisites - Required knowledge/setup
- Demos - Step-by-step demonstrations
- Exercises - Hands-on practice (optional)

**Example**: `apps/main/src/lib/widgets/DEMO_GUIDE.md` (310 lines)

## Documentation Quality Levels

### Comprehensive (Target for core systems)
- **Line count**: 150+ lines
- **Characteristics**:
  - Complete API documentation
  - Multiple code examples
  - Architecture explanations
  - Troubleshooting section
  - Cross-references to related docs

**Examples**:
- `apps/main/src/lib/editing-core/README.md` (358 lines)
- `apps/main/src/lib/gameplay-ui-core/HUD_INTEGRATION_GUIDE.md` (526 lines)
- `apps/main/src/lib/dataBinding/DATA_BINDING_GUIDE.md` (494 lines)

### Adequate (Minimum for public APIs)
- **Line count**: 50-150 lines
- **Characteristics**:
  - Clear purpose statement
  - Basic usage examples
  - API overview
  - Links to related documentation

**Examples**:
- `apps/main/src/lib/game/README.md` (83 lines)
- `apps/main/src/lib/capabilities/README.md` (71 lines)
- `apps/main/src/components/panels/README.md` (54 lines)

### Minimal (Acceptable for organizational READMEs)
- **Line count**: <50 lines
- **Characteristics**:
  - Brief description
  - Directory structure
  - Links to actual documentation

**Use cases**:
- Panel category directories (`dev/`, `tools/`, `shared/`)
- Archive directories
- Simple organizational structures

## Writing Guidelines

### 1. Start with Purpose

Every README should start with a clear statement of purpose:

```markdown
# Component Name

Brief one-sentence description of what this component does.

## Overview

1-2 paragraphs explaining:
- What problem this solves
- When to use it
- Key features
```

### 2. Provide Code Examples

Always include runnable code examples:

```markdown
## Usage

### Basic Example

\`\`\`typescript
import { MyComponent } from './MyComponent';

function App() {
  return <MyComponent prop1="value" prop2={42} />;
}
\`\`\`

### Advanced Example

\`\`\`typescript
// More complex usage with explanation
\`\`\`
```

### 3. Document the API

Use tables for props/parameters:

```markdown
## API

### Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `prop1` | `string` | Yes | - | Description of prop1 |
| `prop2` | `number` | No | `0` | Description of prop2 |
```

### 4. Link to Related Documentation

Always provide context:

```markdown
## Related Documentation

- [System Overview](../../docs/SYSTEM_OVERVIEW.md) - Overall architecture
- [Integration Guide](./INTEGRATION_GUIDE.md) - Detailed integration steps
- [API Reference](../../docs/API_REFERENCE.md) - Complete API docs
```

### 5. Keep Documentation Current

- Update README when making breaking changes
- Add migration guides for major refactors
- Archive outdated documentation with clear markers
- Use "Last Updated" dates for time-sensitive docs

## File Naming Conventions

- **`README.md`** - Primary component/library documentation
- **`INTEGRATION_GUIDE.md`** - Integration instructions
- **`DEMO_GUIDE.md`** - Demos and tutorials
- **`{FEATURE}_GUIDE.md`** - Feature-specific guides (e.g., `DATA_BINDING_GUIDE.md`)
- **`MIGRATION.md`** - Migration guides for breaking changes

## Common Patterns

### Registry Documentation

For registries (panels, dev tools, widgets, etc.):

```markdown
# {Registry Name}

## Overview
What items are registered and why

## Usage
How to register and retrieve items

## API
- `register(item)` - Register a new item
- `get(id)` - Retrieve by ID
- `getAll()` - Get all items

## Examples
Concrete registration examples
```

### Component Directory Organization

For component directories:

```markdown
# {Category} Components

## Structure
Directory organization

## Conventions
When to add components here vs. elsewhere

## Migration Status
Recent reorganization notes (if applicable)
```

## Review Checklist

Before considering component documentation complete:

- [ ] Purpose clearly stated in opening paragraph
- [ ] At least one code example provided
- [ ] API/Props documented (if applicable)
- [ ] Links to related documentation included
- [ ] Examples are runnable and accurate
- [ ] Troubleshooting section (for complex components)
- [ ] Last Updated date included (for guides)

## Examples by Category

### Excellent Component Documentation
- [Generation Components](../apps/main/src/components/generation/README.md)
- [Gizmo Components](../apps/main/src/components/gizmos/README.md)
- [Editing Core Library](../apps/main/src/lib/editing-core/README.md)

### Excellent Integration Guides
- [HUD Integration Guide](../apps/main/src/lib/gameplay-ui-core/HUD_INTEGRATION_GUIDE.md)
- [Overlay Integration Guide](../apps/main/src/lib/overlay/INTEGRATION_GUIDE.md)
- [Widget Integration Guide](../apps/main/src/lib/widgets/INTEGRATION_GUIDE.md)

### Excellent Demo/Tutorial Guides
- [Widget Demo Guide](../apps/main/src/lib/widgets/DEMO_GUIDE.md)
- [Data Binding Guide](../apps/main/src/lib/dataBinding/DATA_BINDING_GUIDE.md)

## Anti-Patterns

### ❌ Avoid

1. **No documentation** - Every non-trivial component needs a README
2. **Outdated examples** - Code examples that don't work
3. **API without examples** - Tables of props without usage examples
4. **No cross-references** - Documentation islands with no context
5. **Overly generic** - "This is a React component" without specifics
6. **Wall of text** - No headings, examples, or formatting

### ✅ Do

1. **Start simple, expand as needed** - Begin with basics, add detail as component matures
2. **Examples first** - Show, then explain
3. **Link generously** - Connect to related documentation
4. **Update with changes** - Keep docs synchronized with code
5. **Use tables for APIs** - Structured reference material
6. **Include troubleshooting** - Address common issues

## Maintenance

### When to Update Documentation

- **Breaking changes** - Update immediately, add migration guide
- **New features** - Add examples and update API docs
- **Bug fixes** - Update examples if they were wrong
- **Refactors** - Update architecture sections
- **Deprecations** - Add deprecation warnings and alternatives

### Documentation Debt

If you can't write full documentation immediately:

1. Add a minimal README with purpose and basic usage
2. Create a TODO comment with what needs to be documented
3. Link to related documentation for context
4. Schedule documentation completion as part of feature work

## Related Documentation

- [Component README Template](../apps/main/docs/COMPONENT_README_TEMPLATE.md) - Template for new components
- [Documentation Index](./INDEX.md) - All project documentation
- [Plugin Developer Guide](./systems/plugins/PLUGIN_DEVELOPER_GUIDE.md) - Plugin documentation standards

---

**Version**: 1.0
**Approved**: 2025-12-06
**Next Review**: 2026-06-06
