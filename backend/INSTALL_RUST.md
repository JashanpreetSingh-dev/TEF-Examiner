# Installing Rust for Python 3.13

Since you're using Python 3.13, some packages (like `pydantic`) need Rust to compile. Here's how to install it:

## Windows Installation

1. **Download and run rustup-init.exe:**
   - Go to https://rustup.rs/
   - Download `rustup-init.exe`
   - Run it and follow the prompts (defaults are fine)

2. **Restart your terminal** after installation

3. **Verify installation:**
   ```bash
   rustc --version
   cargo --version
   ```

4. **Try installing dependencies again:**
   ```bash
   pip install -r requirements.txt
   ```

## Alternative: Use Pre-built Wheels (if available)

If you want to avoid Rust, you can try installing with `--only-binary` to force using pre-built wheels:

```bash
pip install --only-binary :all: -r requirements.txt
```

However, this may fail if wheels aren't available for Python 3.13 yet.

## Why Rust is Needed

- `pydantic` v2 uses Rust for better performance
- Python 3.13 is very new, so pre-built wheels may not exist yet
- Building from source requires Rust compiler

Once Rust is installed, you won't need to think about it again - it just works in the background.

