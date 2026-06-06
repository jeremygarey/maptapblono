# MapTap Blono

A daily map guessing game for Bloomington-Normal, Illinois.

Players get five deterministic daily locations and tap the map as close as they can. Each round scores 0-100 points based on distance, for a daily maximum of 500.

## Local preview

Because this is a static Firebase Hosting app, any static web server works:

```sh
python3 -m http.server 5173 -d public
```

Then open `http://localhost:5173`.

## Firebase Hosting

```sh
firebase login
firebase init hosting
firebase deploy
```

When prompted during `firebase init hosting`, use `public` as the public directory and keep `firebase.json` if asked about overwriting.

## Notes

- Map tiles use OpenStreetMap.
- Satellite tiles use Esri World Imagery.
- The daily five-location set is seeded from the America/Chicago date, so everyone gets the same locations on the same local day.
