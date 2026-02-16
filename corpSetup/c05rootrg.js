/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import {
  getResourceGroupName,
  getLogAnalyticsWorkspaceName,
  getStorageAccountName,
  getBucketName,
  getLambdaFunctionName,
  getCloudfrontDistributionName,
  getLambdaFunctionRoleName,
  getCloudfrontOriginAccessControlName,
  getOriginRequestPolicyName,
  getAppRegistrationName,
} from "../util/namingConvention.cjs";
import { getSubscriptionId, getDefaultAzureLocation, isStorageAccountNameAvailable } from "../util/azureCli.cjs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function setTfVar(name, value) {
  const envKey = `TF_VAR_${name}`;
  process.env[envKey] = value;

  console.log(`Setting terraform variable ${name} to: ${value}`);
}

const env = {
  // please don't modify data, path and loaded directly
  data: null,
  path: null,
  loaded: false,

  loadFromFile(filePath) {
    this.path = filePath;
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf8");
      this.data = dotenv.parse(content);
      this.loaded = true;
    } else {
      // or should we throw error here?
      this.data = {}; // If file does not exist, initialize with empty object
      this.loaded = true;
    }
  },

  ensureLoaded() {
    if (!this.loaded) {
      throw new Error("Env file has not been loaded. Call load() first.");
    }
  },

  get(key, defaultValue = undefined) {
    this.ensureLoaded();
    return this.data[key] ?? defaultValue;
  },

  set(key, value) {
    this.ensureLoaded();
    this.data[key] = String(value);
  },

  add(key, value) {
    this.ensureLoaded();

    if (key in this.data) {
      throw new Error(`ENV key "${key}" already exists`);
    }
    this.data[key] = String(value);
  },

  edit(key, value) {
    this.ensureLoaded();

    if (!(key in this.data)) {
      throw new Error(`ENV key "${key}" does not exist`);
    }
    this.data[key] = String(value);
  },

  delete(key) {
    this.ensureLoaded();
    delete this.data[key];
  },

  saveToFile() {
    this.ensureLoaded();

    if (!this.path) {
      throw new Error("Env file path is not set");
    }

    const content =
      "# if there is no subscription ID, which means no existing subscription, the script will create a new subscription under the billing account provided during c01(bootstrap) stage.\n" +
      Object.entries(this.data)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    writeFileSync(this.path, content);
  },
};

let azureLocation = null;
function getAzureLocation() {
  if (azureLocation) {
    return azureLocation;
  }
  try {
    const tmpazureLocation = getDefaultAzureLocation();
    if (tmpazureLocation && tmpazureLocation.length > 0) {
      return (azureLocation = tmpazureLocation);
    }
  } catch (error) {
    console.error("Failed to get Azure location:", error.message);
  }
  azureLocation = "australiaeast"; // Default fallback location
  console.warn(`Using fallback Azure location: ${azureLocation}`);
  return azureLocation;
}

function main() {
  const autoApprove = process.argv.includes("--auto-approve");

  try {
    // Find the working directory
    const workingDirName = resolve(__dirname, "c05rootrg");
    if (!workingDirName) {
      throw new Error(`c05rootrg directory not found in ${__dirname}`);
    }
    console.log("workingDir:", workingDirName);
    const corpEnvFile = resolve(__dirname, "corp.env");
    if (!existsSync(corpEnvFile)) {
      throw new Error("corp.env file not found.");
    }
    env.loadFromFile(corpEnvFile);
    const corpName = env.get("NAME");
    if (!corpName) {
      throw new Error("NAME is not set in corp.env.");
    }
    let tfStateList = [];
    try {
      console.log("Loading existing terraform state in :", workingDirName);
      tfStateList = execSync("terraform state list", { cwd: resolve(__dirname, workingDirName), encoding: "utf8", stdio: "pipe" })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {}
    console.log("tfStateList:", tfStateList);

        const subscriptionId = env.get("SUBSCRIPTION_ID");
                if (!subscriptionId) {
                  throw new Error("SUBSCRIPTION_ID is not set in corp.env.");
                }
                const dnsName = env.get("DNS");
                if (!dnsName) {
                  throw new Error("DNS is not set in corp.env.");
                }
                const accSubscriptionId = getSubscriptionId();
                if (accSubscriptionId !== subscriptionId) {
                  execSync(`az account set --subscription ${subscriptionId}`, { stdio: "pipe", shell: true });
                  console.log("Switching subscription to", `${corpName}-subscription`);
                }
                const location = getAzureLocation();
                const resourceGroupName = getResourceGroupName("root", corpName);
                const logAnalyticsWorkspaceName = getLogAnalyticsWorkspaceName(corpName);
                const storageAccountName = getStorageAccountName(corpName);
                setTfVar("subscription_id", subscriptionId);
                setTfVar("dns_name", dnsName);
                setTfVar("location", location);
                setTfVar("resource_group_name", resourceGroupName);
                setTfVar("log_analytics_workspace_name", logAnalyticsWorkspaceName);
                setTfVar("storage_account_name", storageAccountName);
        
                execSync(`terraform init`, { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) });
        
                if (!tfStateList.includes("azurerm_resource_group.root_rg")) {
                  let isExisting = false;
                  try {
                    isExisting = !!execSync(`az group show --name ${resourceGroupName} --query id -o tsv`, {
                      encoding: "utf8",
                      stdio: "pipe",
                    }).trim();
                  } catch {}
                  if (isExisting) {
                    console.log("Importing existing Resource Group:", resourceGroupName);
                    execSync(`terraform import azurerm_resource_group.root_rg /subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}`, {
                      stdio: "pipe",
                      shell: true,
                      cwd: resolve(__dirname, workingDirName),
                    });
                  }
                }
        
                if (!tfStateList.includes("azurerm_log_analytics_workspace.log_analytics_workspace")) {
                  let isExisting = false;
                  try {
                    isExisting = !!execSync(
                      `az monitor log-analytics workspace show --resource-group ${resourceGroupName} --workspace-name ${logAnalyticsWorkspaceName} --query id -o tsv`,
                      {
                        encoding: "utf8",
                        stdio: "pipe",
                      }
                    ).trim();
                  } catch {}
                  if (isExisting) {
                    console.log("Importing existing Log Analytics Workspace:", logAnalyticsWorkspaceName);
                    execSync(
                      `terraform import azurerm_log_analytics_workspace.log_analytics_workspace /subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.OperationalInsights/workspaces/${logAnalyticsWorkspaceName}`,
                      {
                        stdio: "pipe",
                        shell: true,
                        cwd: resolve(__dirname, workingDirName),
                      }
                    );
                  }
                }
                if (!tfStateList.includes("azurerm_monitor_diagnostic_setting.activity_log_diagnostics")) {
                  const isExisting = !!execSync(
                    `az monitor diagnostic-settings list --resource /subscriptions/${subscriptionId} --query "[?name=='standard-diagnostics-setting'].id" -o tsv`,
                    {
                      encoding: "utf8",
                      stdio: "pipe",
                    }
                  ).trim();
                  if (isExisting) {
                    console.log("Importing existing Monitor Diagnostic Setting: activity_log_diagnostics");
                    execSync(
                      `terraform import azurerm_monitor_diagnostic_setting.activity_log_diagnostics "/subscriptions/${subscriptionId}|standard-diagnostics-setting"`,
                      {
                        stdio: "pipe",
                        shell: true,
                        cwd: resolve(__dirname, workingDirName),
                      }
                    );
                  }
                }
                if (!tfStateList.includes("azurerm_dns_zone.dns_zone")) {
                  let isExisting = false;
                  try {
                    isExisting = !!execSync(`az network dns zone show --resource-group ${resourceGroupName} --name ${dnsName}`, {
                      encoding: "utf8",
                      stdio: "pipe",
                    }).trim();
                  } catch {}
                  if (isExisting) {
                    console.log("Importing existing DNS Zone:", dnsName);
                    execSync(
                      `terraform import azurerm_dns_zone.dns_zone /subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Network/dnsZones/${dnsName}`,
                      {
                        stdio: "pipe",
                        shell: true,
                        cwd: resolve(__dirname, workingDirName),
                      }
                    );
                  }
                }
                if (!tfStateList.includes("azurerm_storage_account.sa")) {
                  let isExisting = (() => {
                    try {
                      execSync(`az storage account show --resource-group ${resourceGroupName} --name ${storageAccountName}`, { stdio: "ignore" });
                      return true;
                    } catch {
                      return false;
                    }
                  })();
                  if (isExisting) {
                    console.log("Importing existing Storage Account:", storageAccountName);
                    execSync(
                      `terraform import azurerm_storage_account.sa /subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}`,
                      {
                        stdio: "pipe",
                        shell: true,
                        cwd: resolve(__dirname, workingDirName),
                      }
                    );
                    if (!tfStateList.includes("azurerm_storage_container.tfstate_container")) {
                      const containerName = "terraformstate";
                      let isContainerExisting = false;
                      try {
                        const output = execSync(`az storage container exists --name ${containerName} --account-name ${storageAccountName} --query exists -o tsv`, {
                          encoding: "utf8",
                          stdio: "pipe",
                        }).trim();
                        isContainerExisting = output === "true";
                      } catch {
                        throw new Error(`Failed to check container ${containerName}. Make sure you have Storage Blob Data Contributor permission.`);
                      }
                      if (isContainerExisting) {
                        console.log("Importing existing Storage Container:", containerName);
                        execSync(
                          `terraform import azurerm_storage_container.tfstate_container /subscriptions/${subscriptionId}/resourceGroups/${resourceGroupName}/providers/Microsoft.Storage/storageAccounts/${storageAccountName}/blobServices/default/containers/${containerName}`,
                          {
                            stdio: "pipe",
                            shell: true,
                            cwd: resolve(__dirname, workingDirName),
                          }
                        );
                      }
                    }
                  }
                }

    console.log("Starting Terraform initialization.");
    // Run terraform
    execSync(`terraform apply ${autoApprove ? " -auto-approve" : ""}`, {
      stdio: "inherit",
      shell: true,
      cwd: resolve(__dirname, workingDirName),
    });
    if (!env.get("SUBSCRIPTION_ID")) {
      const newSubscriptionId = execSync(`terraform output -raw new_subscription_id`, {
        encoding: "utf-8",
        cwd: resolve(__dirname, workingDirName),
      }).trim();
      env.add("SUBSCRIPTION_ID", newSubscriptionId);
      env.saveToFile();
    }
  } catch (error) {
    console.error(error.stack);
    process.exit(1);
  }
}

main();

export default { main };
