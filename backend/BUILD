python_requirements(
    name="requirements",
    source="requirements.txt",
)

python_sources(
    name="lib",
    sources=["*.py"],
    dependencies=[
        "//backend/agents:lib",
        "//backend/engines:lib",
        "//backend/utils:lib",
        ":requirements",
    ],
)

resources(
    name="config",
    sources=["config/**/*"],
)

resources(
    name="templates",
    sources=["engines/templates/**/*", "instructions/**/*", "prompts/**/*"],
)

pex_binary(
    name="bin",
    entry_point="backend.app",
    dependencies=[":lib", ":config", ":templates"],
)
