# Getting started

1. Install the package 
`npm i -S @yisehak-awm/query-builder`

2. Configure the query builder to work with your schema.

```typescript
<ReactFlowProvider>
  <QueryBuilderContext.Provider
    value={{
      nodeDefinitions,
      edgeDefinitions,
      forms: formFields,
      style: classes,
      icons: Icons,
    }}
  >
    <QueryBuilder nodes={[]} edges={[]} onSubmit={() => {}} />
  </QueryBuilderContext.Provider>
</ReactFlowProvider>
``` 
  * **nodeDefinitions**:  id, name and category (optional) of nodes. Example:

    ```javascript
          const nodeDefinitions: NodeDefinition[] = [
            {
              id: "gene",
              name: "Gene",
              category: CATEGORIES.coding,
            },
            {
              id: "protein",
              name: "Protein",
              category: CATEGORIES.coding,
            }
          ]
    ```

  * **edgeDefinitions**:  id, source, target and label of edges. Example:

    ```javascript
          const edgeDefinitions: EdgeDefinition[] = [
            {
              id: "1",
              source: "snp",
              label: "activity_by_contact",
              target: "gene",
            },
            {
              id: "2",
              source: "uberon",
              label: "subclass_of",
              target: "uberon",
            },
          ]
    ```

* **forms**:  a list of form fields used to configure node parameters. Example:

    ```javascript
          const formFields: NodeFormFieldsMap = {
            protein: [{ label: "Name", name: "protein_name", inputType: "input" }],
            go: [
              { label: "Term name", name: "term_name", inputType: "input" },
              {
                label: "Subontology",
                name: "subontology",
                inputType: "combobox",
                options: [
                  { value: "biological_process" },
                  { value: "molecular_function" },
                  { value: "cellular_component" },
                  { value: "external" },
                  { value: "gene_ontology" },
                ],
              },
            ],
          }
    ```


* **style**:  CSS class names for icons, forms and parameters lists or nodes . Example:

    ```javascript
          const classes: NodeClassDefinitionMap = {
              gene: {
                form: "bg-purple-600 dark:bg-purple-700",
                icon: "bg-purple-500 dark:bg-purple-900",
                params:
                  "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-100",
              },
              protein: {
                icon: "bg-violet-500  dark:bg-violet-900",
                params:
                  "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-100",
                form: "bg-violet-500 dark:bg-violet-700",
              },
          }
    ```
    The "form" classes will apply to the header of the popup parameters form. The "params" classes apply to the list of set parameters that is displayed next to the node ("gene_name" in the screenshot below). The query buidler will adapt to light / dark mode preference. Switch your dark mode preference to have the screenshot change. 

    <picture>
      <source media="(prefers-color-scheme: light)" srcset="https://github.com/user-attachments/assets/df811067-7851-43e3-99c6-6ac675069743">
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/user-attachments/assets/2620afd6-6e8d-43f2-b7b8-adf56a1b465d">
      <img alt="Fallback image description" src="https://github.com/user-attachments/assets/df811067-7851-43e3-99c6-6ac675069743">
    </picture>
<!--     <img width="1089" alt="image" src="https://github.com/user-attachments/assets/df811067-7851-43e3-99c6-6ac675069743" />
    <img width="1089" alt="image" src="https://github.com/user-attachments/assets/2620afd6-6e8d-43f2-b7b8-adf56a1b465d" /> -->



* **icons**:  a map of SVG icons to use for nodes. Example:

    ```javascript
          export const GeneIcon = (props: IconProperties) => {
            return (
              <SVG {...props}>
                <path d="M17.6398 6.47523M12.1688 8.91235M15.6805 4.83803L19.5807 8.56517M11.5822 7.90564L16.0501 12.3284M8.9973 9.15357L14.7815 14.4021M8.31143 11.7778L12.521 15.9491M5.03411 15.5296L8.31143 19.1739M2.5414 16.5396L7.82066 21.5897M16.4483 2.55767C16.4483 2.55767 17.9171 3.89004 19.2747 5.26609C20.6324 6.64213 21.8222 7.90564 21.8222 7.90564M22.4537 7.49515C17.95 10.8905 12.1169 5.187 8.9973 9.15357C5.94373 13.0362 10.1205 17.686 7.82066 22.2325M16.4483 1.76755C13.7903 7.2731 18.1225 11.1364 15.3267 14.4835C11.9638 18.5095 5.41757 13.5633 1.54626 16.5396M14.4095 10.2444" />
              </SVG>
            );
          };

          const Icons: {
            [key: string]: ((props: IconProperties) => JSX.Element) | undefined;
          } = {
            gene: GeneIcon,
            protein: ProteinIcon,
            exon: ExonIcon
          };
    ```
