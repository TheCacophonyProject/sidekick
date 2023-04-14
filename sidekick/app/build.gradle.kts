import java.util.Properties
import java.io.FileInputStream
plugins {
    id("com.android.application")
    kotlin("android")
}
val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
val performSigning = keystorePropertiesFile.exists()
if (performSigning) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}
val sdk = 33
val minSdkVersion = 22
val majorVersion = 3
val minorVersion = 0
val patchVersion = 0
android {
    namespace = "nz.org.cacophony.sidekick"
    compileSdk = sdk
    if (performSigning) {
        signingConfigs {
            create("config") {
                keyAlias = keystoreProperties.getProperty("keyAlias")
                keyPassword = keystoreProperties.getProperty("keyPassword")
                storeFile = file(keystoreProperties.getProperty("storeFile"))
                storePassword = keystoreProperties.getProperty("storePassword")            }
        }
    }
    defaultConfig {
        applicationId = "nz.org.cacophony.sidekick"
        minSdk = minSdkVersion
        targetSdk = sdk
        versionCode =  minSdkVersion * 10000000 + majorVersion * 10000 + minorVersion * 100 + patchVersion
        versionName = "$majorVersion.$minorVersion.$patchVersion"
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
        getByName("release")  {
            isMinifyEnabled = false
            if (performSigning) {
                signingConfig = signingConfigs.getByName("config")
            }
        }
        getByName("release") {
            isMinifyEnabled = false
        }
    }
    sourceSets.getByName("main") {
        java.srcDir("../capacitor-cordova-android-plugins/src/main/libs")
    }
}

repositories {
    mavenCentral()
    google()
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
