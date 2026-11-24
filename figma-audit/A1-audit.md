# HealthHub — A1 Figma audit (read-only)

File **Web designs**, page **HealthyTrack**, node `3164:61200` (a group called "Group 4"). Run 2026-11-17 with the local
`HealthHub Builder` plugin. Nothing in the file was changed. Raw data: `a1-audit.json`; 2× PNGs: `screens/`.

| Screen | Node | Nodes | Groups | Default-named layers |
|---|---|---|---|---|
| Homepage | 2702:1431 | 109 | 26 | 50 |
| Homepage / Version 2 | 2703:2255 | 98 | 24 | 48 |
| Profile Page | 2707:1360 | 150 | 50 | 66 |
| Record / Empty State | 2707:1478 | 75 | 21 | 37 |
| Record | 2707:2385 | 93 | 24 | 46 |
| Appointment / Empty State | 2707:1596 | 74 | 21 | 37 |
| Appointment | 2709:1606 | 73 | 18 | 33 |
| Settings | 2712:1574 | 54 | 14 | 24 |
| Settings version 2 | 2712:2083 | 38 | 6 | 17 |

All nine are 393×852.

## 1. Text styles in use

None of the 101 text layers uses a text style, so every value below is hard-coded. Five font families are in use.

| Family / weight / size | Colour | Used for | Screens |
|---|---|---|---|
| Instrument Sans SemiBold 32 (Bold 32 on Home) | #3A4F7A | Page titles ("Records", "HealthHub") | all |
| Instrument Sans Regular 10 | #333333 @50% | Page subtitles | 7 |
| Instrument Sans Regular 10 | #333333 @25% | Search placeholder | Home ×2 |
| Instrument Sans SemiBold 9.3 (line height 9.3) | #333333 | Service tile labels | Home ×2 |
| Instrument Sans Bold 16 | #333333 | Person name ("Joseph Carper") | Appointment, Record, Profile |
| Instrument Sans Bold 14 | #333333 | Card title ("Annual Checkup") | Appointment, Record |
| Instrument Sans SemiBold 16 / 12 | #3A4F7A | Doctor name, record summary | Appointment, Record |
| Instrument Sans Medium 10 | #3A4F7A @75% | Clinic, "Summary:" | Appointment, Record |
| Instrument Sans Regular 8 | #333333 @50% | Card dates | Appointment, Record |
| Instrument Sans Regular 8 | #8FA3C7 | "Updated 7 days ago" | Profile |
| Instrument Sans Medium 8 | #6D6D6D | Age ("41 years") | Profile |
| Instrument Sans Medium 8 | #F9FAFC / #3A4F7A | "View Details" / "Print" buttons | Record |
| Instrument Sans Medium 20 | #E1E6F0 | "Add", "Book Appointment" buttons | 5 |
| Instrument Sans Medium 16 | #333333 @50% | Empty-state title | Empty ×2 |
| Instrument Sans Medium 12 | #000000 @25% | Empty-state hint | Empty ×2 |
| Instrument Sans SemiBold 24 | #FF4646 @75% | The red "!" | Empty ×2 |
| Instrument Sans Regular 16 / 18 | #333333 @75% | Settings rows / "Log Out" | Settings ×2 |
| Poppins Medium 6 | #2A3B5C @50% | View / Edit / Delete labels | Profile |
| Poppins Medium 8 | #F9FAFC / #3A4F7A | "Reschedule" / "Cancel" | Appointment |
| Satoshi Black/Bold 28, Karu Black 28 | various | Promo banner words (3D double-layer text) | Home ×2 |
| SF Pro Display Semibold 18 | #000000 | Status bar "19:02" | all (remote component) |

The file's own text styles (Orbitron/Open Sans "h1/h2/body…") belong to another project. The `Wayfare/…` styles already use
**Instrument Sans**, the same family as HealthHub, so HealthHub can keep that font.

## 2. Colours in use (31 values, almost none bound to variables)

| Role | Values |
|---|---|
| Brand navy | **#3A4F7A** (52 uses; also @75% ×11, @50% ×15) · #2A3B5C @50% · #537CB7 · #8FA3C7 |
| Text | #333333 (@100/80/75/50/25%) · #000000 (@100/25%) · #6D6D6D · #1E1F21 |
| Surfaces | #FFFFFF (@100/75/55%) · #F3F4F6 (@100/90%) · #F9FAFC (@100/75%) · #E1E6F0 · #C4C4C4 (@100/70%) · #6B7280 @8% |
| Accents (banners only) | #A3D7D4 teal · #FF4646 (@100/75%) · #CB263B · #D4882A |

The navy is **#3A4F7A**, not #3B4F82. Opacity is used to make greys (#333 at 25–80%), which gives five near-identical greys
and unpredictable contrast. Only 1 navy fill and 3 #F9FAFC fills are bound to variables. The 45 bound #000000 fills are
icon vectors. The file has 13 paint styles ("primary clr", "text muted"…) that nothing on these screens uses.

## 3. Repeated elements that should become components

There are no local components. The only instances are the remote iPhone status bar and its battery. Everything else is copied groups.

| Component | Copies found |
|---|---|
| NavBar | 8 (separate group per screen; icons are pasted iconsax SVGs; **Settings has no nav bar**; Home v2 uses a people icon where v1 uses four dots) |
| PageHeader (title + subtitle) | 9 |
| Service / QuickAction tile | 8 (4 per Home) |
| Promo banner | 3 |
| SearchBar | 2 |
| ProfileCard | 3, each with its own "icons for profile cards" action row |
| Appointment card / Record card | 1 + 1 (same structure: title, date, name, sub-line, 2 buttons) |
| Small button pair (Reschedule/Cancel, View Details/Print) | 2 pairs |
| Add / Book Appointment pill button | 4 |
| EmptyState (🚫 illustration + title + alert box) | 2 |
| Settings ListRow | 6 (3 per Settings variant) |
| Icons | ~15 iconsax icons, each pasted as "Clip path group / clip0_4418_…" groups |

## 4. Absolute positioning instead of auto layout

**All 9 screens are free-positioned frames** with 204 groups between them and no auto layout. Frames that do exist
(e.g. "Frame 8", "add icon", "view details", "print", the banner "GET LAB REPORTS") are also layout = none. The screens
sit inside a **group** ("Group 4"), not a section.

## 5. Badly named layers

358 default names across the 9 screens: `Vector`, `Group`, `Rectangle 4/6`, `Frame 2/8/9`, `Ellipse 1`, `Subtract`,
`Clip path group`, `clip0_4418_8583` (SVG import leftovers). Also: the parent group is `Group 4`; Settings rows are named
`Opt 1`, `Opt 2`, **`Otp 3`** (typo); the Home name block is `App name` on screens where it is a page title.

## 6. Text under 12 px and contrast below 4.5:1

**40 of 101 text layers are under 12 px:**
- 6 px: View / Edit / Delete (Profile)
- 8 px: card dates, ages, "Updated N days ago", "Reschedule", "Cancel", "View Details", "Print"
- 9.3 px: service tile labels (line height also 9.3, so 100%)
- 10 px: every page subtitle, search placeholder, "Sunrise Clinic", "Summary:"

**Below 4.5:1** (checked against the screenshots):

| Text | Ratio |
|---|---|
| Search placeholder (#333 @25% on #F3F4F6) | 1.59 |
| Banner "MINUTES" (#D4882A on #537CB7) | 1.49 |
| Empty-state hint (#000 @25% on #F3F4F6) | 1.82 |
| Banner "6 HOURS" v2 (#FF4646 on #A3D7D4) | 2.13 |
| Red "!" (#FF4646 @75%) | 2.46 |
| "Updated N days ago" (#8FA3C7 on white) | 2.55 |
| View / Edit / Delete (#2A3B5C @50%) | 2.73 |
| Card dates (#333 @50% on #F9FAFC) | 2.82 |
| Page subtitles, empty-state titles (#333 @50% on white) | 2.85 |
| Banner "6 HOURS" v1 (#CB263B on #A3D7D4) | 3.41 |
| "Sunrise Clinic" (#3A4F7A @75%) | 4.14 |

Passing: titles (8.1), body #333 (12.6), buttons #E1E6F0 on navy (6.5), Settings rows (5.4).

**Tap targets under 44 px:** profile View/Edit/Delete icons (24), Home filter (29), "View Details"/"Print" (67×40),
"Log out" (96×24). Nav icons are 24–32 px with no defined hit area (groups).

## Other things noticed

- Content data: the "upcoming" appointment is Jun 15, 2025 (past) and the record is May 5, 2024. The family is Jake (41),
  Julie (21), Joseph (16) Carper, which doesn't fit the self/spouse/child/parent model or the Indian content in A5.
- Two near-duplicates: Homepage v1 has two banners, v2 one. Settings v1 and v2 differ only in icon style.
- Home v1 banners use doubled 3D text layers, so each word appears twice.
