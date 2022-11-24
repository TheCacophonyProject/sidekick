pluginManagement {
    repositories {
        google()
        gradlePluginPortal()
        mavenCentral()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
    }
}


rootProject.name = "sidekick"
include(":app")
include(":shared")
include(":capacitor-cordova-android-plugins")
project(":capacitor-cordova-android-plugins").projectDir = File("./capacitor-cordova-android-plugins/")

apply(from = "capacitor.settings.gradle")
