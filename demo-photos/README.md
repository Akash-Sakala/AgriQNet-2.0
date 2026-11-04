# Live demo: a pest alert filling the Karnataka map

## Before the audience arrives

```bash
npm run demo        # resets demo data: 31 districts, 92 farmers, demo accounts, 0 pest alerts
```

`npm run demo` keeps running like `npm run dev`. To reset between rehearsals without restarting, run `npm run demo:reset` in a second terminal (the open map clears within a few seconds).

Open two windows (or a laptop + a phone on the same Wi-Fi):

| Window | Log in with | Go to |
|---|---|---|
| **Officer** (projector) | *Officer demo* · `+91 0000000001` / `officer123` | **Alert Network** (map is all green: "No pest alerts in Karnataka right now") |
| **Farmer** (phone) | *Try demo* · `+91 0000000000` / `demo1234` | Home |

A second farmer, **Lakshmi** (`+91 0000000002` / `demo1234`, same district), is available for step 3.

## The story (about 3 minutes)

1. **An unclear photo goes to the officer.** Farmer → *Pest photo* → *Choose from gallery* → `2-unclear-mole-cricket.jpg`.
   The app says *mole cricket · Not fully sure 25 %*. Tap *Yes, warn nearby farmers* → *Send warning*.
   Result: "Thank you! Report received" — an officer will check it.
   Officer → Alert Network → *Alerts* tab → *Reports waiting for check* → *Approve & send*.
   The map switches to *Map*, **Bengaluru Urban ripples and its neighbours turn red/orange/yellow**, and a toast says "New alert: mole cricket in Bengaluru Urban".

2. **A clear photo goes out at once.** Farmer → *Pest photo* → `1-clear-mole-cricket.jpg` (68 % sure) → *Yes, warn* →
   change *Where did you see it?* to **Mysuru** → *Spreading* → *Send warning*.
   The farmer sees "Warning sent to N farmers in N districts"; within ~4 s the officer's map ripples on Mysuru.

3. *(optional)* **Two farmers agree → sent without an officer.** Reset with `npm run demo`, then send the unclear photo
   from the demo farmer **and** from Lakshmi (same district, same pest). The second report is sent automatically.

Tips: the map refreshes by itself every 4 seconds; same pest + same district while an alert is active gives
"A warning for this pest is already active here".

## Photos

- `1-clear-mole-cricket.jpg` — sample pest photo (IP102 class *mole cricket*); the detector is ~68 % sure.
- `2-unclear-mole-cricket.jpg` — the same photo, blurred to imitate a shaky phone picture; the detector is ~25 % sure.
