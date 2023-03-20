plugins {
    id("com.android.application")
    kotlin("android")
}

android {
    namespace = "nz.org.cacophony.sidekick"
    compileSdk = 33
    defaultConfig {
        applicationId = "nz.org.cacophony.sidekick"
        minSdk = 22
        targetSdk = 33
        versionCode = 1
        versionName = "1.1"
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
    implementation("androidx.appcompat:appcompat:1.4.2")
    implementation("androidx.coordinatorlayout:coordinatorlayout:1.2.0")
    implementation("androidx.activity:activity-compose:1.4.0")
    implementation(project(mapOf("path" to ":capacitor-android")))
    implementation("androidx.core:core-splashscreen:1.0.0-rc01")
    implementation(project(":capacitor-cordova-android-plugins"))
}

apply(from = "capacitor.build.gradle")
