# This script deploys the app registration for selfService by:
# 1. Reading the tenant ID from .env file
# 2. Creating or updating the app registration in Azure AD
# 3. Saving the app registration details back to .env

param(
    [string]$envFile
)

# If no env file path provided, use the web folder's .env
if (-not $envFile) {
    $envFile = Resolve-Path -Path "../../web/.env"
}

if (-not (Test-Path $envFile)) {
    Write-Error "Environment file not found at: $envFile"
    exit 1
}

Write-Output "Using environment file: $envFile"

# Set MODULE_FOLDER to one folder above the current directory
$env:MODULE_FOLDER = Resolve-Path -Path ".."
$env:ENV_FILE = $envFile
Write-Output "Set MODULE_FOLDER to $env:MODULE_FOLDER"

# Install dependencies
Write-Output "Installing dependencies..."
Set-Location $env:MODULE_FOLDER
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Dependency installation failed"
    exit 1
}

# Deploy app registration
Write-Output "Deploying app registration..."
Set-Location $env:MODULE_FOLDER\deploy\code
node ./appRegistration.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Error "App registration deployment failed"
    exit 1
}

Write-Output "App registration deployment completed successfully!"

# Bootstrap groups
Write-Output "`nBootstrapping groups..."
node ./bootstrapGroups.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Group bootstrap failed"
    exit 1
}

Write-Output "Groups bootstrapped successfully!"

# Bootstrap administrative units
Write-Output "`nBootstrapping administrative units..."
node ./bootstrapAdministrativeUnits.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Error "Administrative unit bootstrap failed"
    exit 1
}

Write-Output "Administrative units bootstrapped successfully!"

# Assign API permissions
Write-Output "`nAssigning API permissions..."
node ./assignPermissions.mjs
if ($LASTEXITCODE -ne 0) {
    Write-Error "API permissions assignment failed"
    exit 1
}

Write-Output "API permissions assigned successfully!"