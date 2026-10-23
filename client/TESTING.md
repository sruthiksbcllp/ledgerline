# Frontend Testing (FixTag client)

Stack: **Vitest + React Testing Library + jsdom**. Added under TEST-02 (production-readiness gap register).

## Running

```bash
cd client
npm install --legacy-peer-deps   # --legacy-peer-deps is required by the app (react-qr-reader pins React <=18)
npm test                         # watch mode
npm run test:run                 # single run (use in CI)
npm run test:coverage            # v8 coverage report
```

## Layout

| Path | What it covers |
|------|----------------|
| `vitest.config.js` | jsdom env, `jsxInject` (classic-runtime fallback), setup file, `src/**/*.{test,spec}.{js,jsx}` glob |
| `src/test/setup.js` | jest-dom matchers; `matchMedia` / `ResizeObserver` / `scrollTo` stubs Ant Design v6 needs; per-test `cleanup()` + `localStorage.clear()` |
| `src/test/utils.jsx` | `makeStore(preloadedState)` (fresh Redux store per test) and `renderWithProviders(ui, { store, route })` (wraps in Provider + MemoryRouter) |
| `src/utils/__tests__/` | Pure-logic tests: `apiNormalizer`, `permission`, `format`, `assetMapper` |
| `src/components/__tests__/` | Component tests: `PageHeader`, `ErrorBoundary`, `ProtectedRoute`, `AssetPicker` |
| `src/test/flows/` | Full happy-path flows (e.g. `login.flow.test.jsx`: form -> auth thunk -> store -> guarded dashboard) |

Current suite: **49 tests, all green.**

## Patterns

**Pure functions** — import and assert directly. No DOM needed.

**Components** — use `renderWithProviders` (or plain `render` if no store/router):
```jsx
import { renderWithProviders } from '../../test/utils';
renderWithProviders(<MyComponent />, { route: '/x' });
```

**Mocking the API** — mock the axios instance at its module boundary. Path is relative to the test file:
```jsx
vi.mock('../../utils/api', () => ({
  default: { get: vi.fn(), post: vi.fn() },
  safeApiCall: vi.fn(),
}));
import api from '../../utils/api';
api.get.mockResolvedValue({ data: [...] });
```
Note `utils/api.js` also re-exports `safeApiCall` — include it in the mock or importers break.

**Auth / guarded routes** — seed auth via `makeStore({ auth: { isAuthenticated: true } })`; `ProtectedRoute` also reads `localStorage.user` for the role, so set that for role-restricted cases.

**Ant Design v6 gotchas**
- Needs the `matchMedia`/`ResizeObserver` stubs in `setup.js` — don't remove them.
- `Select` uses a virtual popup; prefer asserting placeholders/labels/derived text over opening the dropdown.
- v6 deprecation warnings (e.g. `Space direction`) are noise, not failures.

## Extending

Add high-value pages next (the register/FAR list, a procurement form, the dashboard summary). Keep flow tests at the store+guard level — don't drag `MainLayout` in, it fans out into dozens of API calls and gets flaky. Wire `npm run test:run` into CI as a required gate alongside the backend E2E.
