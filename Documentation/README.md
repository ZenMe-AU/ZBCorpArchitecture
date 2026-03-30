1. Start with following instructions in "Creating org Microsoft account.docx"

1. Then follow the instructions in "How to create a Free AWS account.docx"

1. Store the passwords in a temporary file?

1. Execute c01
    1. Prepare to execute c01
        1. log into Entra ID by typing "az login" in terminal
        1. sign in with your new account and click continue
        1. select a subscription if requested
        1. in the terminal type "az account show" to see that you are logged in correctly
        1. in corp.env located in CorpSetup folder fill out Name= with your company name
        1. your corp.env file should look something like this:
            ```
            NAME=mycompany
            ```
        1. in variables.tf inside of "c01subscription" folder inside of "corpSetup" you will need to fill out the following variable defaults with your account info:
            - billing_account_name
            - billing_profile_name
            - invoice_section_name
            - contact_emails
        
            follow the instruction inside "How to fill out variables tf.docx" to find these values
    1. Run the following in the terminal under the directory of ZBCorpArchitecture\corpSetup:
        ``` ps
        node initCorpEnvDeploy.js --stage c01
        ```
    1. after c01 finished deploying run the following:
        ```
        az login
        ```
    1. sign in with your azure email.
    1. when the subscription selection screen pops up make sure to select the new subscription that matches the one inside of corp.env
    1. once the new subscription has be selected you should now be done with c01 stage

1. Execute c02. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c02
1. Execute c05
    1. in corp.env located in CorpSetup folder fill out DNS= with your company's DNS
    1. your corp.env should look something like this:
    ```ps
    NAME=mycompany
    DNS=mycompany.com.au
    SUBSCRIPTION_ID=123a45b6-a1bb-1234-abc1-123a4b5c6789
    ```
    1. Execute c05. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c05
    ```
    1. after the deployment finishes go to the dns zone created in azure which should have the same name as the dns in corp.env
    find the server details and give them to your company's dns provider to be stored
    1. once the dns server details have been stored on the provider's end you are finished with executing c05

    
1. Execute c20
    1. log into AWS account by typing the following in your terminal: 
        ``` ps
        aws login
    1. select "continue with Root or IAM user"
    1. select "sign in using root user email"
    1. paste in your email address that you stored and press "Next"
    1. paste your passwords that you stored and press "Sign in"
    1. run the following in the terminal to see if you are logged in: 
        ``` ps
        aws sts get-caller-identity
        ```
    1. Run the following in the terminal:
        ``` ps
        node initCorpEnvDeploy.js --stage c20
        ```
1. Execute c21. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c21
1. Execute c25. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c25
    ```
