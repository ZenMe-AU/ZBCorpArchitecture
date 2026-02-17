/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import {
  getResourceGroupName,
  getStorageAccountName,
  getBucketName,
  getLambdaFunctionName,
  getCloudfrontDistributionName,
  getLambdaFunctionRoleName,
  getCloudfrontOriginAccessControlName,
  getOriginRequestPolicyName,
  getAppRegistrationName,
} from "../util/namingConvention.cjs";
import { getSubscriptionId } from "../util/azureCli.cjs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { setTfVar } from "./tfUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

function main(corpEnvFile) {
  const autoApprove = process.argv.includes("--auto-approve");

  try {
    // Find the working directory that matches the stage
    const workingDirName = resolve(__dirname, "c11cloudfront");
    if (!workingDirName) {
      throw new Error(`c11cloudfront directory not found in ${__dirname}`);
    }
    console.log("workingDir:", workingDirName);
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
        const tenantId = execSync(`az account show --query tenantId -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
        const accSubscriptionId = getSubscriptionId();
        if (accSubscriptionId !== subscriptionId) {
          execSync(`az account set --subscription ${subscriptionId}`, { stdio: "pipe", shell: true });
          console.log("Switching subscription to", `${corpName}-subscription`);
        }
        const resourceGroupName = getResourceGroupName("root", corpName);
        const storageAccountName = getStorageAccountName(corpName);
        try {
          execSync(`az storage account show --resource-group ${resourceGroupName} --name ${storageAccountName}`, { stdio: "ignore" });
        } catch {
          throw new Error(`Storage Account ${storageAccountName} is not found. Please run c05rootrg stage first.`);
        }
        setTfVar("tenant_id", tenantId);
        setTfVar("subscription_id", subscriptionId);
        setTfVar("dns_name", dnsName);
        setTfVar("resource_group_name", resourceGroupName);
        const bucketStaticWebsiteSourceFolder = resolve(__dirname, workingDirName, "source", "webpage");
        const bucketSpaSourceFolder = resolve(__dirname, workingDirName, "source", "loginApp");
        const lambdaEdgeAuthGuardSourceFolder = resolve(__dirname, workingDirName, "source", "authGuardLambdaEdge");
        const lambdaEdgeRewriteHeaderSourceFolder = resolve(__dirname, workingDirName, "source", "rewriteHeaderLambdaEdge");

        setTfVar("app_registration_name", getAppRegistrationName(corpName, "login"));
        setTfVar("bucket_static_website_source_folder", bucketStaticWebsiteSourceFolder);
        setTfVar("bucket_spa_source_folder", bucketSpaSourceFolder);
        setTfVar("lambda_edge_auth_guard_source_folder", lambdaEdgeAuthGuardSourceFolder);
        setTfVar("lambda_edge_rewrite_header_source_folder", lambdaEdgeRewriteHeaderSourceFolder);
        setTfVar("bucket_static_website_name", getBucketName(corpName, "web"));
        setTfVar("bucket_spa_name", getBucketName(corpName, "login"));
        setTfVar("lambda_edge_auth_guard_name", getLambdaFunctionName(corpName, "guard"));
        setTfVar("lambda_edge_auth_guard_role", getLambdaFunctionRoleName(corpName, "guard"));
        setTfVar("lambda_edge_rewrite_header_role", getLambdaFunctionRoleName(corpName, "rewriteHeader"));
        setTfVar("lambda_edge_rewrite_header_name", getLambdaFunctionName(corpName, "rewriteHeader"));
        setTfVar("cf_unavailable_name", getCloudfrontDistributionName(corpName, "unavailable"));
        setTfVar("cf_login_name", getCloudfrontDistributionName(corpName, "login"));
        setTfVar("cf_prod_name", getCloudfrontDistributionName(corpName, "prod"));
        setTfVar("cloudfront_oac_static_website_name", getCloudfrontOriginAccessControlName(corpName, "web"));
        setTfVar("cloudfront_oac_spa_name", getCloudfrontOriginAccessControlName(corpName, "login"));
        setTfVar("origin_request_policy_name", getOriginRequestPolicyName(corpName, "restricted"));

        // TODO: remove hardcoded names after confirming the tf stable and import logic works as expected
        const bucketStaticWebsiteName = `${corpName}-web`;
        const bucketSpaName = `${corpName}-login`;
        const lambdaEdgeAuthGuardRole = `${corpName}-authGuard-func-role`;
        const lambdaEdgeAuthGuardName = `${corpName}-authGuard-func`;
        const cloudfrontOacStaticWebsiteName = `${corpName}-web-oac`;
        const cloudfrontOacSpaName = `${corpName}-login-oac`;
        const appRegistrationName = `${corpName}-login`;
        const originRequestPolicyName = `${corpName}-origin-request-policy`;
        const cfUnavailableName = `${corpName}-cf-unavailable`;
        const cfLoginName = `${corpName}-cf-login`;
        const cfProdName = `${corpName}-cf-prod`;
        setTfVar("bucket_static_website_name", bucketStaticWebsiteName);
        setTfVar("bucket_spa_name", bucketSpaName);
        setTfVar("bucket_static_website_source_folder", bucketStaticWebsiteSourceFolder);
        setTfVar("bucket_spa_source_folder", bucketSpaSourceFolder);
        setTfVar("lambda_edge_auth_guard_role", lambdaEdgeAuthGuardRole);
        setTfVar("lambda_edge_auth_guard_name", lambdaEdgeAuthGuardName);
        setTfVar("lambda_edge_auth_guard_source_folder", lambdaEdgeAuthGuardSourceFolder);
        setTfVar("cloudfront_oac_static_website_name", cloudfrontOacStaticWebsiteName);
        setTfVar("cloudfront_oac_spa_name", cloudfrontOacSpaName);
        setTfVar("app_registration_name", appRegistrationName);
        setTfVar("origin_request_policy_name", originRequestPolicyName);
        setTfVar("cf_unavailable_name", cfUnavailableName);
        setTfVar("cf_login_name", cfLoginName);
        setTfVar("cf_prod_name", cfProdName);
        //==============================================================
        execSync(
          `terraform init -reconfigure\
            -backend-config="resource_group_name=${resourceGroupName}" \
            -backend-config="storage_account_name=${storageAccountName}" \
            -backend-config="container_name=terraformstate" \
            -backend-config="key=${workingDirName}.tfstate"`,
          { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) }
        );

        // install dependencies and build for SPA
        execSync(`pnpm install`, { stdio: "pipe", shell: true });
        execSync(`pnpm run build`, { stdio: "pipe", shell: true, cwd: bucketSpaSourceFolder });
        // install dependencies for lambda@edge
        execSync(`pnpm run build`, { stdio: "pipe", shell: true, cwd: lambdaEdgeAuthGuardSourceFolder });

        // if (!tfStateList.includes("aws_cloudwatch_log_group.lambda_edge_auth_guard_logs ")) {
        //   execSync(`terraform import aws_cloudwatch_log_group.lambda_edge_auth_guard_logs /aws/lambda/${lambdaEdgeAuthGuardName}`, {
        //     stdio: "inherit",
        //     shell: true,
        //     cwd: resolve(__dirname, workingDirName),
        //   });
        // }


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

export { main };
