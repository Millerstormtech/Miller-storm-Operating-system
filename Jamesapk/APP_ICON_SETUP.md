# App Icon Setup Instructions

## Current Configuration
- App Icon Image: `assets/images/logo-1.jpeg`
- Package: `flutter_launcher_icons`

## Steps to Generate App Icon

### 1. Install Dependencies
```bash
cd D:\Office\james\Jamesapk
flutter pub get
```

### 2. Generate App Icons
```bash
flutter pub run flutter_launcher_icons
```

This will automatically:
- Generate all required icon sizes for Android (mipmap folders)
- Generate all required icon sizes for iOS (Assets.xcassets)
- Update AndroidManifest.xml
- Update Info.plist

### 3. Verify the Icons

#### For Android:
Check these folders:
- `android/app/src/main/res/mipmap-hdpi/`
- `android/app/src/main/res/mipmap-mdpi/`
- `android/app/src/main/res/mipmap-xhdpi/`
- `android/app/src/main/res/mipmap-xxhdpi/`
- `android/app/src/main/res/mipmap-xxxhdpi/`

#### For iOS:
Check: `ios/Runner/Assets.xcassets/AppIcon.appiconset/`

### 4. Build and Test
```bash
# For Android
flutter build apk

# For iOS
flutter build ios

# Or run on device/emulator
flutter run
```

## Troubleshooting

### If icons don't appear:
1. Clean the build:
   ```bash
   flutter clean
   flutter pub get
   flutter pub run flutter_launcher_icons
   ```

2. Rebuild the app:
   ```bash
   flutter build apk --release
   ```

### Image Requirements:
- Format: PNG, JPEG, or JPG
- Recommended size: 1024x1024 pixels
- Square aspect ratio
- No transparency for Android (will be removed automatically)

## Alternative: Manual Icon Setup

If you prefer to set icons manually without the package:

### Android:
1. Generate icons at different sizes using an online tool
2. Place them in respective mipmap folders
3. Update `android/app/src/main/AndroidManifest.xml`:
   ```xml
   <application
       android:icon="@mipmap/ic_launcher"
       ...>
   ```

### iOS:
1. Open `ios/Runner.xcworkspace` in Xcode
2. Navigate to Assets.xcassets > AppIcon
3. Drag and drop icon images for each size

## Current Icon Path
The app is configured to use: `assets/images/logo-1.jpeg`

To change the icon, either:
1. Replace `logo-1.jpeg` with your new icon (keep the same name)
2. Or update `pubspec.yaml` with the new path and run the generator again
