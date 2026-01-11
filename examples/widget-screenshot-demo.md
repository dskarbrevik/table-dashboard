
# Widget Screenshot Demo (Table-Based)

This file demonstrates all table-based table-dashboard widgets as shown in the README, including the required HTML comment tags and tableTag parameters.

---

## Example Habit Table (Weekly)

<!-- table-tag: weekly -->

| Activity    | Done |
|-------------|------|
| Exercise    | ✓    |
| Reading     | ✓    |
| Meditation  | ✓    |

---

## Single Progress Bar (Table)

```table-dashboard
type: progress_bar
source: current-file
tableTag: weekly
keyColumn: Activity
key: Exercise
valueColumn: Done
value: "✓"
goal: 5
label: Weekly Exercise Progress
```

---

## Multi-Widget Dashboard (Table)

```table-dashboard
layout: compact-list
source: current-file
tableTag: weekly

type: progress_bar
keyColumn: Activity
key: Exercise
valueColumn: Done
value: "✓"
goal: 5
label: 🏋️ Exercise

---

type: counter
keyColumn: Activity
key: Reading
valueColumn: Done
value: "✓"
label: 📚 Reading

---

type: streak
keyColumn: Activity
key: Meditation
valueColumn: Done
value: "✓"
label: 🧘 Meditation
```

---

## Numeric Values Table (Reps)

<!-- table-tag: reps -->

| Activity | Reps |
|----------|------|
| Pushups  | 25   |
| Situps   | 30   |

```table-dashboard
type: counter
source: current-file
tableTag: reps
keyColumn: Activity
key: Pushups
valueColumn: Reps
value: numeric
aggregate: sum
label: Total Pushups
```

---

## Dynamic Goals Table (Goals)

<!-- table-tag: goals -->

| Activity | Current | Goal |
|----------|---------|------|
| Running  | 8       | 20   |

```table-dashboard
type: progress_bar
source: current-file
tableTag: goals
keyColumn: Activity
key: Running
valueColumn: Current
value: numeric
aggregate: sum
goalColumn: Goal
label: Running Progress
```
