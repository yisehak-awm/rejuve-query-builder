import { QueryBuilder, QueryBuilderContext } from "../src/index";
import { edgeDefinitions, nodeDefinitions } from "../src/config/schema";
import classes from "../src/config/style";
import Icons from "../src/config/icons";
import formFields from "../src/config/form";
import "./style.css";

function QueryBuilderComponent() {
  return (
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
  );
}

export default {
  title: "QueryBuilderComponent",
  component: QueryBuilderComponent,
};

export const Primary = {};
