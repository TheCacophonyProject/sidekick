import { Title } from "solid-start";
import Counter from "~/components/Counter";
import { Capacitor } from "@capacitor/core";
// import Dashboard from "~/plugins/Dashboard";
import { createResource } from "solid-js";


export default function Home() {
  // const [test] = createResource(Dashboard.getTest)
  return (
    <main>
      <Title>Hello {Capacitor.getPlatform()}</Title>
      <h1>Hello {Capacitor.getPlatform()}!</h1>
      <Counter />
      <p>
        {/* {!test.loading && test().test} */}
      </p>
    </main>
  );
}
