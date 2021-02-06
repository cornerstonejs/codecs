# codecs

## Packages

This repository is maintained as a monorepo. This means that this repository, instead of containing a single project, contains many projects. If you explore our project structure, you'll see the following:

```bash
.
├── packages                #
│   ├── charls-js           # 
│   ├── libjpeg-turbojs     # 
│   └── openjpegjs          #
│
├── ...                     # misc. shared configuration
├── lerna.json              # MonoRepo (Lerna) settings
├── package.json            # Shared devDependencies and commands
└── README.md               # This file
```

### Codec Package Anatomy

...