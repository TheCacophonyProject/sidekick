import java.util.Properties
import java.io.FileInputStream

plugins {
    id("com.android.application")
    id("com.google.gms.google-services")
    id("com.google.firebase.crashlytics")
    kotlin("android")
}
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
val performSigning = keystorePropertiesFile.exists()
if (performSigning) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
val sdk = 35
val minSdkVersion = 23
val majorVersion = 3
val minorVersion = 15
val patchVersion = 1
android {
    buildToolsVersion = "35.0.0"
    namespace = "nz.org.cacophony.sidekick"
    compileSdk = sdk
    if (performSigning) {
        signingConfigs {
            create("config") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")
            }
        }
    }
    defaultConfig {
        applicationId = "nz.org.cacophony.sidekick"
        minSdk = minSdkVersion
        targetSdk = sdk
        versionCode =
            minSdkVersion * 10000000 + majorVersion * 10000 + minorVersion * 100 + patchVersion
        versionName = "$majorVersion.$minorVersion.$patchVersion"
    }
    buildFeatures {
        compose = true
    }
    composeOptions {
        kotlinCompilerExtensionVersion = "1.5.15"
    }
    packagingOptions {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    buildTypes {
        getByName("release") {
            signingConfig = signingConfigs.getByName("debug")
            if (performSigning) {
                signingConfig = signingConfigs.getByName("config")
            }
        }
    }
    sourceSets.getByName("main") {
        java.srcDir("../capacitor-cordova-android-plugins/src/main/libs")
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }
    kotlinOptions {
        jvmTarget = "21"
    }
    java {
        toolchain {
            languageVersion.set(JavaLanguageVersion.of(21))
        }
    }
}

repositories {
    mavenCentral()
    google()
}

dependencies {
    implementation(project(":shared"))
    implementation(fileTree(mapOf("dir" to "libs", "include" to listOf("*.jar"))))
    implementation("androidx.appcompat:appcompat:1.6.1")
    implementation("androidx.coordinatorlayout:coordinatorlayout:1.2.0")
    implementation("androidx.activity:activity-compose:1.9.0")
    implementation(platform("com.google.firebase:firebase-bom:33.0.0"))
    implementation("com.google.firebase:firebase-crashlytics-ktx")
    implementation("com.google.firebase:firebase-analytics-ktx")
    implementation(project(mapOf("path" to ":capacitor-android")))
    implementation("androidx.core:core-splashscreen:1.0.1")
    implementation(project(":capacitor-cordova-android-plugins"))
}

apply(from = "capacitor.build.gradle")
