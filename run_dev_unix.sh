#!/bin/bash

echo "Please select your platform:"
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

if [ "$(uname)" == "Darwin" ]; then
	# Do something under Mac OS X platform
	IP=$(ifconfig en0 | grep inet | awk '$1=="inet" {print $2}')
elif [ "$(expr substr $(uname -s) 1 5)" == "Linux" ]; then
	# Do something under Linux platform
	IP=$(ip route get 1 | awk '{print $7}')
fi

ionic cap run $PLATFORM -l --external --port=5173 --public-host=localhost
