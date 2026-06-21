#!/bin/bash

echo "🔧 Setting up Forgot Password Feature"
echo "======================================"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install nodemailer
npm install --save-dev @types/nodemailer @types/bcryptjs

echo ""
echo "✅ Dependencies installed!"
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  .env file not found!"
    echo "Creating .env file..."
    cat > .env << 'EOF'
MONGODB_URI=mongodb://localhost:27017/millerstorm

# Application URL (for password reset links)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# SMTP Email Configuration
# For Gmail: smtp.gmail.com, port 587, secure=false
# For Outlook: smtp-mail.outlook.com, port 587, secure=false
# For SendGrid: smtp.sendgrid.net, port 587, secure=false
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM="Miller Storm OS <noreply@millerstorm.com>"
EOF
    echo "✅ .env file created!"
else
    echo "✅ .env file exists"
fi

echo ""
echo "📋 Next Steps:"
echo "=============="
echo ""
echo "1. Update .env file with your SMTP credentials:"
echo "   - SMTP_HOST: Your SMTP server (e.g., smtp.gmail.com)"
echo "   - SMTP_PORT: Usually 587"
echo "   - SMTP_USER: Your email address"
echo "   - SMTP_PASS: Your email password or app password"
echo ""
echo "2. For Gmail users:"
echo "   - Enable 2FA: https://myaccount.google.com/security"
echo "   - Generate App Password: https://myaccount.google.com/apppasswords"
echo ""
echo "3. For testing without real emails:"
echo "   - Sign up at Mailtrap: https://mailtrap.io/"
echo "   - Use Mailtrap SMTP credentials in .env"
echo ""
echo "4. Start the development server:"
echo "   npm run dev"
echo ""
echo "5. Test the feature:"
echo "   - Go to http://localhost:3000/forgot-password"
echo "   - Enter a test email"
echo "   - Check your inbox (or Mailtrap)"
echo ""
echo "📚 Documentation:"
echo "   - SMTP_SETUP_GUIDE.md - Email provider setup"
echo "   - FORGOT_PASSWORD_FLOW.md - Feature documentation"
echo ""
echo "✅ Setup complete!"
