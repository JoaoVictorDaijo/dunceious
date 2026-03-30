# src/shared

Cross-cutting utilities and abstractions shared across all features.

| Folder      | Contents                                               |
|-------------|--------------------------------------------------------|
| `constants/`| App-wide constants (keybindings, limits, defaults)     |
| `errors/`   | Typed error classes                                    |
| `hooks/`    | Generic React hooks (debounce, resize observer, etc.)  |
| `ui/`       | Primitive UI components (buttons, modals, tooltips)    |
| `utils/`    | Pure helper functions with no business logic           |

> **Phase status**: Scaffolded, ready to receive code extracted from
> `services/bioUtils.ts` and generic hook logic from `src/app/App.tsx`.
