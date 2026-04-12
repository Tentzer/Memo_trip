Add your country background images in this folder.

Recommended naming:
- `italy.jpg`
- `france.jpg`
- `united-states.jpg`

After adding a file here, register it in `lib/countryPhotos.ts`.

Example:

```ts
const countryPhotoRegistry: Record<string, ImageSourcePropType> = {
    italy: require('../assets/country photos/italy.jpg'),
};
```
