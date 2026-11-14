# Potato Pahtato

A 3D first-person shooter in a giant kitchen. Your weapon: a potato peeler. Your enemies: angry potatoes.

## Run it
    npm install
    npm run dev        # open the address it prints, then click Play
    npm run build      # production build into dist/

## What's in it
- Main menu with a live 3D kitchen background, chef name changer and rank nametag
- Settings: Graphics (presets, render scale, shadows, bloom, particles, FPS), Audio (master/sfx/music),
  Gameplay (sensitivity, invert Y, FOV, shake, bob, damage numbers, crosshair) and a full key/mouse rebinder
- 20-wave campaign with 4 bosses and a victory screen, then endless mode
- Enemies: Spudling, Tater Tosser, Hash Brown (lunges), Jacket Spud (splits), Sweet Brute, 4 bosses
- Upgrade shop after every wave (pick 1 of 3 with keys 1/2/3): damage, crits, pierce, magazine, reload, fire rate, health, speed, Peel Storm charge, lifesteal, luck
- Peeling death animation: skin spirals off in ribbons, the naked potato spins, then pops
- Combo multiplier up to x5, Peel Storm ultimate, butter and Golden Spud pickups, radar, target name label
- Procedural music and sound effects (no audio files)
- Rank and records saved in your browser

## Default controls
WASD move, Shift sprint, Space jump, mouse aim, click fire, R reload, Q or right-click Peel Storm. Change them in Settings > Controls.

## Built with
Three.js (3D + bloom), Vite, WebAudio.

## Glass nametag
Tap F5 (rebindable in Settings > Controls, "Show glass nametag") to show or hide a liquid-glass nametag with your name and rank. The game blocks F5's normal page refresh.

## Put it on the internet (Cloudflare Workers)
    npm install
    npx wrangler login      # only needed once
    npm run deploy
Your site goes live at https://potato-pahtato.<your-subdomain>.workers.dev

## Playing on a phone
Open the site on your phone and turn it sideways. Left half of the screen: touch and drag for the joystick (push all the way for sprint). Right half: drag to look. Buttons: FIRE (hold), JUMP, RELOAD, STORM (ring fills as it charges), pause, nametag. Settings has touch button size and a left-handed layout. Phones start on Low graphics; raise it in Settings if it runs smoothly.

## Leaderboard, stats and privacy (v1.5)

- **Leaderboard**: main menu > Leaderboard. Your best score per chef name is posted after every run (top 25 shown). Tabs: *Top chefs* and *Game stats*.
- **Stats** are anonymous: waves reached, upgrades picked, frame rate, device type. No name, no IP address is stored. Raw numbers: `/api/stats`.
- **Opt out** any time in Settings > Online (post scores / share anonymous stats).
- **Build stamp** in the bottom-right of the main menu (`v1.5.0 · built ...`) tells you which deploy is live.
- **Moderation**: `npx wrangler d1 execute potato-pahtato --remote --command "DELETE FROM scores WHERE id=N"`

### First-time backend setup
```
npx wrangler d1 create potato-pahtato     # say "no" if asked to edit config
npm run set-db-id
npm run db:remote
npm run deploy
```
Later updates: just `npm run deploy`. Local test: `npm run test:api` (with `npm run dev:api` running).
