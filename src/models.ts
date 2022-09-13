import { DataTypes, Sequelize } from 'sequelize'

export const sequelize = new Sequelize({
  host: '192.168.50.114',
  dialect: 'mysql',
  username: 'root',
  password: '123456',
  database: 'dev_kits',
  define: {
    freezeTableName: true,
  },
})

export const Project = sequelize.define('project', {
  name: {
    type: DataTypes.STRING,
  },
})

export const ProjectTemplate = sequelize.define('project_template', {
  name: {
    type: DataTypes.STRING,
  },
  type: {
    type: DataTypes.TINYINT,
  },
  template: {
    type: DataTypes.TEXT,
  },
  projectId: {
    type: DataTypes.INTEGER,
  },
})

export const Address = sequelize.define('address', {
  name: {
    type: DataTypes.STRING,
  },
  parentId: {
    type: DataTypes.INTEGER,
  },
  projectId: {
    type: DataTypes.INTEGER,
  },
  prefix: {
    type: DataTypes.STRING,
  },
})

export const Codegen = sequelize.define('codegen', {
  name: {
    type: DataTypes.STRING,
  },
  parentId: {
    type: DataTypes.INTEGER,
  },
})

export const CodegenTemplate = sequelize.define('codegen_template', {
  name: {
    type: DataTypes.STRING,
  },
  template: {
    type: DataTypes.TEXT,
  },
  codegenId: {
    type: DataTypes.INTEGER,
  },
})
