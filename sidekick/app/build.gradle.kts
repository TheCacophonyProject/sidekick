plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "nz.org.cacophony.sidekick"
    compileSdk = 32
    defaultConfig {
        applicationId = "nz.org.cacophony.sidekick"
        minSdk = 22
        targetSdk = 32
        versionCode = 1
        versionName = "1.0"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.4.3"
    }
    packagingOptions {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            isMinifyEnabled = false
        }
    }
}

repositories {
    flatDir {
        dirs("../capacitor-cordova-android-plugins/src/main/libs", "libs")
    }
    google()
    mavenCentral()
}

dependencies {
    implementation(project(":shared"))
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation(project(mapOf("path" to ":capacitor-android")))
}

apply(from = "capacitor.build.gradle")
