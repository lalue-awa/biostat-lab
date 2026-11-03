# Prompts Log

## Prompt 1: Initial App Build
- **Goal**: Build a Vite web app using `webr` to analyze enzyme kinetics data.
- **Prompt Sent**:
  > "Create a simple Vite web application called BioStat Lab. Use the webr npm package so R runs in the browser. The app should load data/enzyme_kinetics.csv and fit Michaelis-Menten equation using nls() for each condition. Show Vmax, Km SE, an interactive plot, and executed R code."

  ## Prompt 2: Fix CSV File Reading Error
  - **Issue**: Encountered `read.table: empty beginning of file` error during runtime.
  - **Prompt Sent**:
    > "I encountered runtime error: read.table: empty beginning of file. Please fix how the app loads data/enzyme_kinetics.csv into webR using fetch and webR.FS.writeFile before running R code."
    - **Outcome**: The AI fixed the asynchronous file writing logic, resolving the runtime crash.