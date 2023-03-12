#!/bin/sh
                if [ "YES" = "$OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED" ]; then
                  echo "Skipping Gradle build task invocation due to OVERRIDE_KOTLIN_BUILD_IDE_SUPPORTED environment variable set to "YES""
                  exit 0
                fi
                set -ev
                REPO_ROOT="$PODS_TARGET_SRCROOT"
                "$REPO_ROOT/../gradlew" -p "$REPO_ROOT" $KOTLIN_PROJECT_PATH:syncFramework                     -Pkotlin.native.cocoapods.platform=$PLATFORM_NAME                     -Pkotlin.native.cocoapods.archs="$ARCHS"                     -Pkotlin.native.cocoapods.configuration="$CONFIGURATION"

