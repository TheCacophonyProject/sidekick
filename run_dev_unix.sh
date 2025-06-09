#!/bin/bash

# Check if the system is OSX
if [[ "$OSTYPE" == "darwin"* ]]; then
  echo "OSX detected. Please select your platform:"
  echo "1) Android"
  echo "2) iOS"
  read -p "Enter selection: " SELECTION
  case $SELECTION in
  1)
    PLATFORM='android'
    ;;
  2)
    PLATFORM='ios'
    ;;
  *)
    echo "Invalid selection!"
    exit 1
    ;;
  esac
else
  echo "Non-OSX system detected. Automatically selecting Android."
  PLATFORM='android'
fi

if [[ "$PLATFORM" == "android" ]]; then
  # Set up ADB reverse proxy so localhost works on device
  if command -v adb >/dev/null 2>&1; then
    echo "Setting up ADB reverse for port 5173..."
    adb reverse tcp:5173 tcp:5173
  else
    echo "Warning: adb not found. Please install Android Platform Tools."
  fi
fi

ionic cap run $PLATFORM -l --external --port=5173 --public-host="localhost"
