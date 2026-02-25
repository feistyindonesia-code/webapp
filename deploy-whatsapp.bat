@echo off
REM ========================================
REM WhatsApp Webhook Deployment Script
REM ========================================

echo.
echo ========================================
echo Deploying WhatsApp Webhook to Supabase
echo ========================================
echo.

REM Check if Supabase CLI is installed
where supabase >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo Supabase CLI not found. Please install it first.
    echo Run: npm install -g supabase
    exit /b 1
)

REM Set your access token (replace with your token)
set SUPABASE_ACCESS_TOKEN=sbp_0a6fa5717861c95e16f5949a37ec8528161e7040

REM Link to Supabase project
echo.
echo Step 1: Linking to Supabase project...
supabase link --project-ref ztefkcbgkdqgvcfphvys

if %ERRORLEVEL% NEQ 0 (
    echo Failed to link to Supabase project. Check your access token.
    exit /b 1
)

REM Set environment variables
echo.
echo Step 2: Setting environment variables...
supabase secrets set WHATSAPP_DEVICE_ID=92b2af76-130d-46f0-b811-0874e3407988
supabase secrets set WEB_ORDER_URL=https://ztefkcbgkdqgvcfphvys.supabase.co/weborder

REM Deploy the function
echo.
echo Step 3: Deploying WhatsApp webhook...
supabase functions deploy whatsapp-webhook

if %ERRORLEVEL% NEQ 0 (
    echo Failed to deploy function.
    exit /b 1
)

echo.
echo ========================================
echo Deployment complete!
echo ========================================
echo.
echo Your webhook URL:
echo https://ztefkcbgkdqgvcfphvys.supabase.co/functions/v1/whatsapp-webhook
echo.
echo Please register this URL in your Whacenter dashboard.
echo.
pause
