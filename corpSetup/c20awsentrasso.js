/**
 * @license SPDX-FileCopyrightText: © 2025 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execFileSync, execSync } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { tmpdir } from "os";
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
    const workingDirName = resolve(__dirname, "c20awsentrasso");
    if (!workingDirName) {
      throw new Error(`c20awsentrasso directory not found in ${__dirname}`);
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
    
        //IMPORTANT: Need Global Administrator role active to run this code
        const subscriptionId = env.get("SUBSCRIPTION_ID");
        if (!subscriptionId) {
          throw new Error("SUBSCRIPTION_ID is not set in corp.env.");
        }
        const tenantId = execSync(`az account show --query tenantId -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
        const accSubscriptionId = getSubscriptionId();
        if (accSubscriptionId !== subscriptionId) {
          execSync(`az account set --subscription ${subscriptionId}`, { stdio: "pipe", shell: true });
          console.log("Switching subscription to", `${corpName}-subscription`);
        }

        setTfVar("tenant_id", tenantId);
        setTfVar("subscription_id", subscriptionId);
       
        // create sso for aws account


    console.log("Starting Terraform initialization.");
    execSync(`terraform init`, { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) });
    // Run terraform
  } catch (error) {
    console.error(error.stack);
    process.exit(1);
  }
}

export function manual_message() {

  console.log("\n=== Enterprise SSO creation finished ===");
  console.log("\n=== Make sure to assign a user or a group to the Enterprise App ===");
}

export function c20_post_apply_saml_save(terraformCwd, samlEntityId = "urn:amazon:webservices") {
  process.exit();
  let tempDir = null;
  try {
    const servicePrincipalObjectId = execSync("terraform output -raw object_id", {
      cwd: terraformCwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    }).trim();
    const applicationResourceId = execSync("terraform output -raw application_id", {
      cwd: terraformCwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    }).trim();
    const applicationObjectId = applicationResourceId.split("/").pop();

    if (!servicePrincipalObjectId) {
      console.warn("Skipping post-apply SAML updates: missing service principal object_id output.");
      return;
    }
    if (!applicationObjectId) {
      console.warn("Skipping post-apply SAML updates: missing application_id output.");
      return;
    }

    const spRequestBody = JSON.stringify({ preferredSingleSignOnMode: "saml" });
    let effectiveEntityId = samlEntityId;
    let identifierUpdated = false;
    let samlModeUpdated = false;
    let signingCertificateUpdated = false;
    let claimsPolicyUpdated = false;

    tempDir = mkdtempSync(join(tmpdir(), "c20-saml-"));
    const appPayloadPath = join(tempDir, "application-patch.json");
    const spPayloadPath = join(tempDir, "service-principal-patch.json");
    const spCertCreatePayloadPath = join(tempDir, "service-principal-cert-create.json");
    const spPreferredCertPayloadPath = join(tempDir, "service-principal-preferred-cert.json");
    const claimsPolicyPayloadPath = join(tempDir, "claims-policy.json");
    const claimsPolicyAssignRefPath = join(tempDir, "claims-policy-ref.json");

    writeFileSync(spPayloadPath, spRequestBody, "utf8");

    const patchIdentifierUri = (entityId) => {
      writeFileSync(appPayloadPath, JSON.stringify({ identifierUris: [entityId] }), "utf8");
      execFileSync(
        "az",
        [
          "rest",
          "--method",
          "PATCH",
          "--url",
          `https://graph.microsoft.com/v1.0/applications/${applicationObjectId}`,
          "--headers",
          "Content-Type=application/json",
          "--body",
          `@${appPayloadPath}`,
        ],
        { stdio: "pipe", shell: true, encoding: "utf8" }
      );
    };

    try {
      execFileSync(
        "az",
        [
          "rest",
          "--method",
          "PATCH",
          "--url",
          `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}`,
          "--headers",
          "Content-Type=application/json",
          "--body",
          `@${spPayloadPath}`,
        ],
        { stdio: "inherit", shell: true }
      );
      samlModeUpdated = true;
    } catch (samlModeError) {
      console.warn(`Could not save SAML single sign-on mode: ${samlModeError.message}`);
    }

    try {
      let spDetailsRaw = execFileSync(
        "az",
        [
          "rest",
          "--method",
          "GET",
          "--url",
          `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}?$select=preferredTokenSigningKeyThumbprint,keyCredentials`,
        ],
        { stdio: "pipe", shell: true, encoding: "utf8" }
      );

      let spDetails = JSON.parse(spDetailsRaw || "{}");
      let preferredThumbprint = spDetails?.preferredTokenSigningKeyThumbprint || "";

      if (!preferredThumbprint) {
        const certExpiry = new Date();
        certExpiry.setUTCFullYear(certExpiry.getUTCFullYear() + 2);
        writeFileSync(
          spCertCreatePayloadPath,
          JSON.stringify({
            displayName: "CN=AWS SSO Signing",
            endDateTime: certExpiry.toISOString(),
          }),
          "utf8"
        );

        const addCertRaw = execFileSync(
          "az",
          [
            "rest",
            "--method",
            "POST",
            "--url",
            `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}/addTokenSigningCertificate`,
            "--headers",
            "Content-Type=application/json",
            "--body",
            `@${spCertCreatePayloadPath}`,
          ],
          { stdio: "pipe", shell: true, encoding: "utf8" }
        );

        const addCert = JSON.parse(addCertRaw || "{}");
        const customKeyIdentifier = addCert?.keyCredential?.customKeyIdentifier;
        if (customKeyIdentifier) {
          preferredThumbprint = Buffer.from(customKeyIdentifier, "base64").toString("hex").toUpperCase();
        }

        if (!preferredThumbprint) {
          spDetailsRaw = execFileSync(
            "az",
            [
              "rest",
              "--method",
              "GET",
              "--url",
              `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}?$select=keyCredentials`,
            ],
            { stdio: "pipe", shell: true, encoding: "utf8" }
          );
          spDetails = JSON.parse(spDetailsRaw || "{}");
          const keyCredentials = Array.isArray(spDetails?.keyCredentials) ? spDetails.keyCredentials : [];
          const keyWithThumbprint = keyCredentials.find((k) => k?.customKeyIdentifier);
          if (keyWithThumbprint?.customKeyIdentifier) {
            preferredThumbprint = Buffer.from(keyWithThumbprint.customKeyIdentifier, "base64").toString("hex").toUpperCase();
          }
        }
      }

      if (preferredThumbprint) {
        writeFileSync(
          spPreferredCertPayloadPath,
          JSON.stringify({ preferredTokenSigningKeyThumbprint: preferredThumbprint }),
          "utf8"
        );
        execFileSync(
          "az",
          [
            "rest",
            "--method",
            "PATCH",
            "--url",
            `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}`,
            "--headers",
            "Content-Type=application/json",
            "--body",
            `@${spPreferredCertPayloadPath}`,
          ],
          { stdio: "pipe", shell: true, encoding: "utf8" }
        );
        signingCertificateUpdated = true;
      }
    } catch (signingCertError) {
      console.warn(`Could not configure SAML signing certificate: ${signingCertError.message}`);
    }

    try {
      patchIdentifierUri(effectiveEntityId);
      identifierUpdated = true;
    } catch (identifierError) {
      const identifierErrorText = `${identifierError.message}\n${identifierError.stderr ? String(identifierError.stderr) : ""}`;
      const blockedByTenantPolicy =
        identifierErrorText.includes("InvalidUniqueTenantIdentifierAsPerAppPolicy") ||
        identifierErrorText.includes("InvalidIdentifierUri");

      if (!blockedByTenantPolicy) {
        console.warn(`Could not set requested SAML Entity ID \"${samlEntityId}\": ${identifierError.message}`);
      } else {
        const tenantId = execSync("az account show --query tenantId -o tsv", {
          encoding: "utf8",
          stdio: "pipe",
          shell: true,
        }).trim();

        effectiveEntityId = `api://${tenantId}/${applicationObjectId}`;
        try {
          patchIdentifierUri(effectiveEntityId);
          identifierUpdated = true;
          console.warn(
            `Requested SAML Entity ID \"${samlEntityId}\" is blocked by tenant policy. Using \"${effectiveEntityId}\" instead.`
          );
        } catch (fallbackIdentifierError) {
          console.warn(`Could not set fallback SAML Entity ID \"${effectiveEntityId}\": ${fallbackIdentifierError.message}`);
        }
      }
    }

    if (identifierUpdated) {
      console.log(`SAML Identifier (Entity ID) set to: ${effectiveEntityId}`);
    } else {
      console.warn("SAML Identifier (Entity ID) was not updated.");
    }

    if (samlModeUpdated) {
      console.log("SAML single sign-on mode saved via Microsoft Graph.");
    } else {
      console.warn("SAML single sign-on mode was not updated.");
    }

    if (signingCertificateUpdated) {
      console.log("SAML signing certificate configured on service principal.");
    } else {
      console.warn("SAML signing certificate was not updated.");
    }

    // try {
    //   const readOptionalTerraformOutput = (name) => {
    //     try {
    //       return execSync(`terraform output -raw ${name}`, {
    //         cwd: terraformCwd,
    //         encoding: "utf8",
    //         stdio: "pipe",
    //         shell: true,
    //       }).trim();
    //     } catch {
    //       return "";
    //     }
    //   };

    //   let awsRoleArn = readOptionalTerraformOutput("aws_iam_role_arn");
    //   let awsSamlProviderArn = readOptionalTerraformOutput("aws_iam_saml_provider_arn");

    //   if (!awsRoleArn || !awsSamlProviderArn) {
    //     try {
    //       const awsAccountId = execSync("aws sts get-caller-identity --query Account --output text", {
    //         encoding: "utf8",
    //         stdio: "pipe",
    //         shell: true,
    //       }).trim();

    //       if (!awsRoleArn) {
    //         awsRoleArn = `arn:aws:iam::${awsAccountId}:role/EntraID-AdminAccessC`;
    //       }
    //       if (!awsSamlProviderArn) {
    //         awsSamlProviderArn = `arn:aws:iam::${awsAccountId}:saml-provider/EntraC`;
    //       }
    //     } catch {
    //       // Leave empty and allow placeholder fallback below.
    //     }
    //   }

    //   if (!awsRoleArn) {
    //     awsRoleArn = "placeholder";
    //   }
    //   if (!awsSamlProviderArn) {
    //     awsSamlProviderArn = "placeholder";
    //   }

    //   const claimsPolicyDisplayName = `AWS-SAML-Claims-${applicationObjectId}`;
    //   const awsRoleJoinValue = `${awsRoleArn},${awsSamlProviderArn}`;
    //   const claimsPolicyDefinition = {
    //     ClaimsMappingPolicy: {
    //       Version: 1,
    //       IncludeBasicClaimSet: "true",
    //       ClaimsSchema: [
    //         {
    //           Value: awsRoleJoinValue,
    //           SamlClaimType: "https://aws.amazon.com/SAML/Attributes/Role",
    //         },
    //         {
    //           Source: "user",
    //           ID: "userprincipalname",
    //           SamlClaimType: "https://aws.amazon.com/SAML/Attributes/RoleSessionName",
    //         },
    //         {
    //           Value: "900",
    //           SamlClaimType: "https://aws.amazon.com/SAML/Attributes/SessionDuration",
    //         },
    //         {
    //           Source: "user",
    //           ID: "userprincipalname",
    //           SamlClaimType: "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier",
    //         },
    //         {
    //           Source: "user",
    //           ID: "assignedroles",
    //           JwtClaimType: "appRoles",
    //         },
    //       ],
    //       ClaimsTransformation: [
    //         {
    //           ID: "JoinRole",
    //           TransformationMethod: "Join",
    //           InputParameters: [
    //             {
    //               ID: "string1",
    //               Value: "arn:aws:iam::198333343378:role/EntraID-AdminAccessC",
    //             },
    //             {
    //               ID: "string2",
    //               Value: "arn:aws:iam::198333343378:saml-provider/EntraC",
    //             },
    //             {
    //               ID: "separator",
    //               Value: ",",
    //             },
    //           ],
    //           OutputClaims: [
    //             {
    //               ClaimTypeReferenceId: "SsoRole",
    //               TransformationClaimType: "outputClaim",
    //             },
    //           ],
    //         },
    //       ],
    //     },
    //   };

    //   const claimsPolicyBody = {
    //     displayName: claimsPolicyDisplayName,
    //     definition: [JSON.stringify(claimsPolicyDefinition)],
    //     isOrganizationDefault: false,
    //   };
    //   writeFileSync(claimsPolicyPayloadPath, JSON.stringify(claimsPolicyBody), "utf8");

    //   const listPoliciesRaw = execFileSync(
    //     "az",
    //     [
    //       "rest",
    //       "--method",
    //       "GET",
    //       "--url",
    //       `https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies?$filter=${encodeURIComponent(`displayName eq '${claimsPolicyDisplayName}'`)}`,
    //     ],
    //     { stdio: "pipe", shell: true, encoding: "utf8" }
    //   );
    //   const listPolicies = JSON.parse(listPoliciesRaw || "{}");
    //   let claimsPolicyId = listPolicies?.value?.[0]?.id;

    //   if (claimsPolicyId) {
    //     execFileSync(
    //       "az",
    //       [
    //         "rest",
    //         "--method",
    //         "PATCH",
    //         "--url",
    //         `https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies/${claimsPolicyId}`,
    //         "--headers",
    //         "Content-Type=application/json",
    //         "--body",
    //         `@${claimsPolicyPayloadPath}`,
    //       ],
    //       { stdio: "pipe", shell: true, encoding: "utf8" }
    //     );
    //   } else {
    //     const createPolicyRaw = execFileSync(
    //       "az",
    //       [
    //         "rest",
    //         "--method",
    //         "POST",
    //         "--url",
    //         "https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies",
    //         "--headers",
    //         "Content-Type=application/json",
    //         "--body",
    //         `@${claimsPolicyPayloadPath}`,
    //       ],
    //       { stdio: "pipe", shell: true, encoding: "utf8" }
    //     );
    //     const createdPolicy = JSON.parse(createPolicyRaw || "{}");
    //     claimsPolicyId = createdPolicy?.id;
    //   }

    //   if (claimsPolicyId) {
    //     const assignedPoliciesRaw = execFileSync(
    //       "az",
    //       [
    //         "rest",
    //         "--method",
    //         "GET",
    //         "--url",
    //         `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}/claimsMappingPolicies?$select=id`,
    //       ],
    //       { stdio: "pipe", shell: true, encoding: "utf8" }
    //     );
    //     const assignedPolicies = JSON.parse(assignedPoliciesRaw || "{}");
    //     const alreadyAssigned = (assignedPolicies?.value || []).some((policy) => policy.id === claimsPolicyId);

    //     if (!alreadyAssigned) {
    //       writeFileSync(
    //         claimsPolicyAssignRefPath,
    //         JSON.stringify({
    //           "@odata.id": `https://graph.microsoft.com/v1.0/policies/claimsMappingPolicies/${claimsPolicyId}`,
    //         }),
    //         "utf8"
    //       );
    //       execFileSync(
    //         "az",
    //         [
    //           "rest",
    //           "--method",
    //           "POST",
    //           "--url",
    //           `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}/claimsMappingPolicies/$ref`,
    //           "--headers",
    //           "Content-Type=application/json",
    //           "--body",
    //           `@${claimsPolicyAssignRefPath}`,
    //         ],
    //         { stdio: "pipe", shell: true, encoding: "utf8" }
    //       );
    //     }
    //     claimsPolicyUpdated = true;
    //   }
    // } catch (claimsError) {
    //   console.warn(`Could not configure AWS claims mapping policy: ${claimsError.message}`);
    // }

    // if (claimsPolicyUpdated) {
    //   console.log("AWS claims mapping policy configured on service principal.");
    // } else {
    //   console.warn("AWS claims mapping policy was not updated.");
    // }
  } catch (error) {
    console.warn("Post-apply SAML configuration skipped:", error.message);
  } finally {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

export { main };