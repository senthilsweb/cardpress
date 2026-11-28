# Pictures for trying CardPress

Test data for the three kinds of picture under **Design → Images**. They are not part of the app.

| Folder | Use it as | Shows on |
|---|---|---|
| `background/` | Background image | Own image |
| `screenshot/` | App screenshot | Browser frame |
| `photos/` | Photos | Photo mosaic, or the headshot on the Headshot layout |

## Load them into a test copy
```sh
node testdata/media/load.mjs http://127.0.0.1:8080
```
Adds these to a brand's media library and makes one example post for each way a card shows a picture. It signs in as the
test admin of `scripts/seed-test-users`, works only against this machine, and adds each thing once. It needs `npm ci` in
`scripts/record-demo` and Chrome.

## Sources
The photographs are from Wikimedia Commons, released as public domain (CC0), taken in at the width Commons offers.
The screenshot is of CardPress itself, with invented example data.

| File | Source | Author | Licence |
|---|---|---|---|
| `background/mountain-lake.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lake_Mountain_Landscape.jpg) | Bonnie Moreland | CC0 |
| `background/ocean-waves.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Ocean_waves_rippling_(Unsplash).jpg) | Tim Marshall timmarshall | CC0 |
| `photos/coffee-mug.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Coffee_steaming_in_a_mug.jpg) | PedanticNarrativeController | CC0 |
| `photos/blue-cup.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Blue_coffee_cup_(Unsplash).jpg) | rawpixel.com rawpixel | CC0 |
| `photos/forest-path.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Forest_path_surrounded_by_green_trees.jpg) | Zed Can77 | CC0 |
| `photos/castle-at-night.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chateau_Frontenac_illuminated_at_night_in_Quebec_City.jpg) | Wilfredor | CC0 |
| `photos/desk.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Books,_pencils,_laptop,_and_iphone_on_a_desk_(Unsplash).jpg) | Aleks Dorohovich aleksdorohovich | CC0 |
| `photos/pink-flowers.jpg` | [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Close-up_of_Pink_Flowers_with_Raindrops.jpg) | Garahin4 | CC0 |
| `screenshot/cardpress-dashboard.png` | This project | CardPress | MIT, as the project |
