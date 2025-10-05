# Options Form Field Inventory

| Section | Field ID | Control | Default | Option Key | Notes |
| --- | --- | --- | --- | --- | --- |
| rest | restHttpsUrl | text | https://127.0.0.1:27124/ | httpsUrl | Also populates baseUrl fallback |
| rest | restHttpUrl | text | http://127.0.0.1:27123/ | httpUrl |  |
| rest | restVault | text | YourVault | vault |  |
| rest | restKey | password |  | apiKey |  |
| templates | tplArticle | text | Articles/{domain}/{yyyy}/{slug}.md | article |  |
| templates | tplFragment | text | Fragments/{yyyy}/{mm}/{dd}/{title}.md | fragment |  |
| templates | tplAI | text | AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md | ai |  |
| domainMappings | domainMappings | custom | DEFAULT_DOMAIN_MAPPINGS | domainMappings | Managed via domainMappings component |
| aiChat | aiIncludeTimestamps | checkbox | false | includeTimestamps |  |
| aiChat | aiUserName | text | USER | userName |  |
| deepResearch | deepResearchPureMode | checkbox | false | pureMode |  |
| fragmentClipper | fragmentUseFootnote | checkbox | true | useFootnoteFormat |  |
| fragmentClipper | fragmentCaptureContext | checkbox | false | captureContext | Toggles visibility of context length/mode controls |
| classifier | clsEnable | checkbox | false | enabled | Toggles classifierConfig block |
| classifier | clsProvider | select | ollama | provider | Select options defined in HTML |
| classifier | clsEndpoint | text | http://localhost:11434/api/chat | endpoint |  |
| classifier | clsModel | text | llama3.1 | model |  |
| classifier | clsKey | password |  | apiKey |  |
| classifier | clsTax | textarea | DEFAULT_CLASSIFIER_TAXONOMY | taxonomy | JSON string, parsed via parseClassifierTaxonomy |
