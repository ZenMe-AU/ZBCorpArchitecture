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

1. Execute c02. Run the following in the terminal:
    ``` ps
    node initCorpEnvDeploy.js --stage c02
1. Execute c05
    1. in corp.env located in CorpSetup folder fill out Name= with your company name
    1. then fill out DNS= with your company's DNS
    1. your corp.env should look something like this:
    ```ps
    NAME=mycompany
    DNS=mycompany.com.au
    ```
    
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
