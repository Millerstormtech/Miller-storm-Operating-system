#!/bin/bash

# Fix and Seed Script for millerstorm.tech

echo "=== Fixing seed.js to use correct MongoDB URI ==="

cd /var/www/millerstorm

# Update seed.js to use environment variable
cat > seed.js.tmp << 'SEEDEOF'
const bcrypt = require("bcryptjs");
const mongoose = require("mongoose");
require('dotenv').config();

const uri = process.env.MONGODB_URI || "mongodb://localhost:27017/millerstorm";
SEEDEOF

# Get the rest of seed.js (skip first 4 lines)
tail -n +5 seed.js >> seed.js.tmp
mv seed.js.tmp seed.js

echo "=== Verifying .env file ==="
cat .env | grep MONGODB_URI

echo ""
echo "=== Running seed script ==="
node seed.js

echo ""
echo "=== Verifying users were created ==="
mongosh "mongodb://dsatguru:vivekVOra32+@69.62.66.123:27017/millerstorm?authSource=admin" --eval "db.users.countDocuments()"

echo ""
echo "=== Restarting application ==="
pm2 restart millerstorm

echo ""
echo "=== Waiting 3 seconds for app to start ==="
sleep 3

echo ""
echo "=== Testing application ==="
curl -I http://localhost:6789/login

echo ""
echo "=== Done! ==="
echo "Try accessing: http://millerstorm.tech/login"
SEEDEOF

chmod +x /var/www/millerstorm/FIX_AND_SEED.sh
