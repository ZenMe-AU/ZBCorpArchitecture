/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
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
    const workingDirName = resolve(__dirname, "c01subscription");
    if (!workingDirName) {
      throw new Error(`c01subscription directory not found in ${__dirname}`);
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

        const subscription_name = `${corpName}-subscription`;

        // set terraform variables
        setTfVar("subscription_name", subscription_name);
        setTfVar("subscription_id", getSubscriptionId());
        // setTfVar("billing_account_name", env.get("BILLING_ACCOUNT_NAME"));
        // setTfVar("billing_profile_name", env.get("BILLING_PROFILE_NAME"));
        // setTfVar("invoice_section_name", env.get("INVOICE_SECTION_NAME"));
        setTfVar("contact_emails", '["jake.vosloo@outlook.com", "LukeYeh@zenme.com.au"]'); // check if working on windows os

        execSync(`terraform init`, { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) });

        // import existing resource
        let subscriptionId = env.get("SUBSCRIPTION_ID") ?? getSubscriptionId(subscription_name);

        if (subscriptionId && subscriptionId.length > 0) {
          if (!tfStateList.includes("azurerm_subscription.payg")) {
            const aliasId = execSync(`az account alias list --query "value[?properties.subscriptionId=='${subscriptionId}'].id" -o tsv`, {
              encoding: "utf8",
              stdio: "pipe",
            }).trim();
            console.log("Importing existing Subscription with ID:", subscriptionId);
            execSync(`terraform import azurerm_subscription.payg ${aliasId}`, {
              stdio: "pipe",
              shell: true,
              cwd: resolve(__dirname, workingDirName),
            });
          }
          if (!tfStateList.includes("azurerm_consumption_budget_subscription.payg_budget")) {
            const budget = execSync(`az consumption budget list --subscription ${subscriptionId} --query "[?name=='monthly-budget'].name" -o tsv`, {
              encoding: "utf8",
              stdio: "pipe",
            }).trim();
            if (budget && budget.length > 0) {
              console.log("Importing existing monthly-budget");
              execSync(
                `terraform import azurerm_consumption_budget_subscription.payg_budget /subscriptions/${subscriptionId}/providers/Microsoft.Consumption/budgets/monthly-budget`,
                {
                  stdio: "pipe",
                  shell: true,
                  cwd: resolve(__dirname, workingDirName),
                }
              );
              // execSync(`terraform state show azurerm_consumption_budget_subscription.payg_budget`, {
              //   stdio: "inherit",
              //   shell: true,
              //   cwd: resolve(__dirname, workingDirName),
              // });
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
