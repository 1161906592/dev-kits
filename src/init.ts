import { Project, ProjectTemplate, Address, Codegen, CodegenTemplate } from './models'

Project.sync({ force: true })
ProjectTemplate.sync({ force: true })
Address.sync({ force: true })
Codegen.sync({ force: true })
CodegenTemplate.sync({ force: true })
