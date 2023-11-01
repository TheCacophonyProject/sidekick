# Sidekick
The application allows users to connect and manage their Cacophony Cameras.

The stack uses a unique setup of [Kotlin Multiplatform  Mobile](https://lp.jetbrains.com/kmm-for-crossplatform-developers/), and [Capacitor.js](https://capacitorjs.com/) to create a cross-platform mobile app. The app is built using [Solid.js](https://www.solidjs.com/), a declarative JavaScript library for creating user interfaces.


## Prerequisites

- [Node.js](https://nodejs.org/en/) version 18 or higher
- Java 17
- [Android Studio](https://developer.android.com/studio) (For android development)
- Xcode (For iOS development, this will require a Mac)

## Developing
It's recommended to use pnpm to install dependencies. To install pnpm, run:
```bash
npm install -g pnpm
```
You will first need to open the project in Android Studio to [./sidekick](./sidekick/) so gradle can download the dependencies, then run in root file:
```bash
pnpm install
# If you want to create a release build which you can run through Android Studio
pnpm build
pnpm sync
# or if you want to run the app in development mode
pnpm dev
```
**Note:** Most features require a physical device, so ensure you have enabled USB debugging on your device and connected it to your machine.

## Release

Android builds are handled automatically through github releases.
iOS builds are handled manually through Xcode Archive.

Note that the versions must be incremented in the following files:
- [./sidekick/app/build.gradle.kts](./sidekick/app/build.gradle.kts)
- [./sidekick/App/App.xcodeproj/project.pbxproj](./sidekick/App/App.xcodeproj/project.pbxproj)
