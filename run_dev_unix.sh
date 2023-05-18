#!/bin/bash
IP=$(ip route get 1 | awk '{print $7}')
ionic cap run android -l --external --port=5173 --public-host=$IP
