# Audit Line Count Report

## Overview

This report provides line counts for different audit scopes. The categorization follows industry standards where:
- **Included**: Contracts with executable logic, libraries with functions, storage contracts
- **Excluded**: Type definitions (structs/enums only), interfaces (declarations only), mocks (test files), ABIs (generated artifacts)

## File Breakdown

### Main Contracts
| File | Lines | Category |
|------|-------|----------|
| `StreamFactory.sol` | 380 | Core |
| `StreamCore.sol` | 778 | Core |
| `StreamBasic.sol` | 40 | Core |
| `StreamPostActions.sol` | 195 | Extended |
| `PoolRouter.sol` | 130 | Extended |
| `VestingFactory.sol` | 77 | Extended |
| `TokenFactory.sol` | 33 | Extended |

### Pool Wrappers
| File | Lines | Category |
|------|-------|----------|
| `PoolWrapper.sol` | 97 | Full |
| `V2PoolWrapper.sol` | 68 | Full |
| `V3PoolWrapper.sol` | 138 | Full |
| `AerodromePoolWrapper.sol` | 109 | Full |

### Libraries
| File | Lines | Category | Used By |
|------|-------|----------|---------|
| `lib/math/DecimalMath.sol` | 96 | Minimal | StreamCore, StreamFactory |
| `lib/math/StreamMathLib.sol` | 231 | Minimal | StreamCore |
| `lib/TransferLib.sol` | 63 | Minimal | StreamCore, StreamFactory |
| `lib/math/TickMath.sol` | 213 | Full | Pool wrappers |
| `lib/PoolOps.sol` | 58 | Full | Pool wrappers |

### Storage
| File | Lines | Category | Used By |
|------|-------|----------|---------|
| `storage/PositionStorage.sol` | 72 | Minimal | StreamCore |

### Tokens
| File | Lines | Category |
|------|-------|----------|
| `tokens/StandardERC20.sol` | 51 | Full |

### Type Definitions (Excluded from counts)
| File | Lines | Note |
|------|-------|------|
| `types/StreamTypes.sol` | 89 | Data structures only |
| `types/StreamFactoryTypes.sol` | 40 | Data structures only |
| `types/PositionTypes.sol` | 17 | Data structures only |
| `types/PoolRouterTypes.sol` | 26 | Data structures only |
| `types/PoolWrapperTypes.sol` | 24 | Data structures only |
| **Total Types** | **196** | Not counted in audit scope |

---

## Audit Scope Line Counts

### Minimal Audit
**Scope**: Factory + Core + Basic + Core Dependencies (essential streaming functionality)

| Component | Lines |
|-----------|-------|
| **Main Contracts** | |
| StreamFactory.sol | 380 |
| StreamCore.sol | 778 |
| StreamBasic.sol | 40 |
| **Subtotal** | **1,198** |
| **Core Dependencies** | |
| lib/math/DecimalMath.sol | 96 |
| lib/math/StreamMathLib.sol | 231 |
| lib/TransferLib.sol | 63 |
| storage/PositionStorage.sol | 72 |
| **Subtotal** | **462** |
| **TOTAL** | **1,660 lines** |

**What's included:**
- Factory contract for creating streams
- Core streaming logic and state management
- Basic stream implementation
- **Core dependencies**: Libraries and storage used by StreamCore and StreamFactory
  - DecimalMath (used by StreamCore & StreamFactory)
  - StreamMathLib (used by StreamCore)
  - TransferLib (used by StreamCore & StreamFactory)
  - PositionStorage (used by StreamCore)

**What's excluded:**
- Post-actions (pool creation, vesting)
- Pool wrappers and router
- Additional factories (Vesting, Token)
- Pool-specific libraries (TickMath, PoolOps)
- Type definitions

---

### Core Audit
**Scope**: Minimal + PostActions + Router + VestingFactory + TokenFactory

| Component | Lines |
|-----------|-------|
| **Minimal Audit Components** | |
| StreamFactory.sol | 380 |
| StreamCore.sol | 778 |
| StreamBasic.sol | 40 |
| lib/math/DecimalMath.sol | 96 |
| lib/math/StreamMathLib.sol | 231 |
| lib/TransferLib.sol | 63 |
| storage/PositionStorage.sol | 72 |
| **Subtotal** | **1,660** |
| **Extended Components** | |
| StreamPostActions.sol | 195 |
| PoolRouter.sol | 130 |
| VestingFactory.sol | 77 |
| TokenFactory.sol | 33 |
| **Subtotal** | **435** |
| **TOTAL** | **2,095 lines** |

**What's included:**
- All Minimal Audit components (including core dependencies)
- Post-stream actions (pool creation, vesting)
- Pool routing logic
- Vesting factory
- Token factory

**What's excluded:**
- Pool wrapper implementations (V2, V3, Aerodrome)
- Pool-specific libraries (TickMath, PoolOps)
- Token implementations

---

### Full Audit
**Scope**: All logic (complete system)

| Component | Lines |
|-----------|-------|
| **Main Contracts** | |
| StreamFactory.sol | 380 |
| StreamCore.sol | 778 |
| StreamBasic.sol | 40 |
| StreamPostActions.sol | 195 |
| PoolRouter.sol | 130 |
| VestingFactory.sol | 77 |
| TokenFactory.sol | 33 |
| **Subtotal** | **1,633** |
| **Pool Wrappers** | |
| PoolWrapper.sol | 97 |
| V2PoolWrapper.sol | 68 |
| V3PoolWrapper.sol | 138 |
| AerodromePoolWrapper.sol | 109 |
| **Subtotal** | **412** |
| **Libraries** | |
| lib/math/DecimalMath.sol | 96 |
| lib/math/StreamMathLib.sol | 231 |
| lib/math/TickMath.sol | 213 |
| lib/PoolOps.sol | 58 |
| lib/TransferLib.sol | 63 |
| **Subtotal** | **661** |
| **Storage** | |
| storage/PositionStorage.sol | 72 |
| **Subtotal** | **72** |
| **Tokens** | |
| tokens/StandardERC20.sol | 51 |
| **Subtotal** | **51** |
| **TOTAL** | **2,829 lines** |

**What's included:**
- All Core Audit components
- All pool wrapper implementations
- All supporting libraries
- Storage contracts
- Token implementations

**What's excluded:**
- Type definitions (196 lines - structs/enums only)
- Interfaces (declarations only)
- Mock contracts (test files)
- ABIs (generated artifacts)

---

## Recommendations

### Category Assessment
✅ **The categorization makes sense** for audit purposes:

1. **Minimal Audit** - Focuses on core streaming mechanics without advanced features
2. **Core Audit** - Includes all user-facing features and factories
3. **Full Audit** - Complete system including all supporting infrastructure

### What to Count for Audits

**✅ Count (Executable Logic):**
- Contract implementations
- Libraries with functions
- Storage contracts with logic

**❌ Don't Count (No Executable Logic):**
- Type definitions (structs, enums)
- Interfaces (declarations)
- Mock contracts (test files)
- ABIs (generated)

### Notes

- **Type files** (196 lines total) contain only data structure definitions and are excluded from line counts as they don't contain executable logic
- **Interfaces** are excluded as they're just declarations
- **Mock contracts** are excluded as they're test utilities
- All line counts are based on actual source code, excluding comments and blank lines where applicable (wc -l counts all lines)

---

## Summary Table

| Audit Scope | Line Count | Description |
|-------------|------------|-------------|
| **Minimal** | **1,660** | Factory + Core + Basic + Core Dependencies |
| **Core** | **2,095** | Minimal + PostActions + Router + Factories |
| **Full** | **2,829** | All logic including wrappers, libraries, storage, tokens |

---

*Report generated: $(date)*
*Source directory: packages/hardhat/src/*

